// Azure Storage Konfiguration
const accountName = "YOURSTORAGEACCOUNT"; // Dein Azure Storage Account Name
const sasToken = "YOUR_SAS_TOKEN"; // SAS Token mit den entsprechenden Berechtigungen
const containerName = "notes"; // Container-Name für die Notizen

// Globale Variablen
let blobServiceClient;
let containerClient;

// DOM Elemente
const noteTitleInput = document.getElementById('note-title');
const noteContentInput = document.getElementById('note-content');
const saveNoteButton = document.getElementById('save-note');
const notesList = document.getElementById('notes-list');
const statusMessage = document.getElementById('status-message');

// Initialisierung beim Laden der Seite
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Azure Storage SDK initialisieren
        initializeAzureStorage();
        
        // Event-Listener hinzufügen
        saveNoteButton.addEventListener('click', saveNote);
        
        // Notizen laden
        await listNotes();
        
        showStatus('Mit Azure Storage verbunden.', 'success');
    } catch (error) {
        showStatus('Fehler bei der Verbindung zu Azure Storage: ' + error.message, 'error');
        console.error('Initialization error:', error);
    }
});

// Azure Storage initialisieren
function initializeAzureStorage() {
    try {
        // Blob Service Client erstellen mit SAS Token
        const blobSasUrl = `https://${accountName}.blob.core.windows.net/?${sasToken}`;
        blobServiceClient = new Azure.Storage.Blob.BlobServiceClient(blobSasUrl);
        
        // Container Client erstellen
        containerClient = blobServiceClient.getContainerClient(containerName);
        
        console.log('Azure Storage Client initialisiert');
    } catch (error) {
        throw new Error('Fehler bei der Azure Storage Initialisierung: ' + error.message);
    }
}

// Notiz speichern
async function saveNote() {
    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();
    
    if (!title || !content) {
        showStatus('Bitte geben Sie einen Titel und Inhalt ein.', 'error');
        return;
    }
    
    try {
        showStatus('Notiz wird gespeichert...', '');
        
        // Dateiname generieren (mit Datum für Eindeutigkeit)
        const fileName = `${title}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        
        // Blob Client erstellen
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        
        // Metadaten erstellen (speichert auch den Titel)
        const metadata = {
            title: title,
            createdAt: new Date().toISOString()
        };
        
        // Notiz hochladen
        await blockBlobClient.upload(content, content.length, {
            metadata: metadata,
            blobHTTPHeaders: {
                blobContentType: "text/plain"
            }
        });
        
        // Erfolg anzeigen
        showStatus('Notiz erfolgreich gespeichert!', 'success');
        
        // Eingabefelder leeren
        noteTitleInput.value = '';
        noteContentInput.value = '';
        
        // Notizen neu laden
        await listNotes();
        
    } catch (error) {
        showStatus('Fehler beim Speichern der Notiz: ' + error.message, 'error');
        console.error('Save error:', error);
    }
}

// Notizen auflisten
async function listNotes() {
    try {
        // Liste leeren
        notesList.innerHTML = '';
        
        // Notizen abrufen
        let blobs = [];
        for await (const blob of containerClient.listBlobsFlat()) {
            blobs.push(blob);
        }
        
        // Sortieren nach neuesten Dateien
        blobs.sort((a, b) => {
            return new Date(b.properties.createdOn) - new Date(a.properties.createdOn);
        });
        
        // Keine Notizen vorhanden
        if (blobs.length === 0) {
            notesList.innerHTML = '<p>Keine Notizen vorhanden.</p>';
            return;
        }
        
        // Notizen anzeigen
        for (const blob of blobs) {
            const title = blob.metadata?.title || blob.name;
            const date = new Date(blob.properties.createdOn).toLocaleString();
            
            const noteItem = document.createElement('li');
            noteItem.className = 'note-item';
            noteItem.innerHTML = `
                <div class="note-info">
                    <div class="note-title">${title}</div>
                    <div class="note-date">${date}</div>
                </div>
                <div class="note-controls">
                    <span class="download-note" data-name="${blob.name}" title="Herunterladen">📥</span>
                    <span class="delete-note" data-name="${blob.name}" title="Löschen">🗑️</span>
                </div>
            `;
            notesList.appendChild(noteItem);
            
            // Event-Listener für Download und Löschen
            noteItem.querySelector('.download-note').addEventListener('click', () => downloadNote(blob.name));
            noteItem.querySelector('.delete-note').addEventListener('click', () => deleteNote(blob.name));
        }
        
    } catch (error) {
        showStatus('Fehler beim Laden der Notizen: ' + error.message, 'error');
        console.error('List error:', error);
    }
}

// Notiz herunterladen
async function downloadNote(blobName) {
    try {
        // Blob Client erstellen
        const blobClient = containerClient.getBlobClient(blobName);
        
        // Blob herunterladen
        const downloadResponse = await blobClient.download();
        
        // Inhalt lesen
        const content = await streamToText(downloadResponse.blobBody);
        
        // Datei erstellen und herunterladen
        const a = document.createElement('a');
        const blob = new Blob([content], { type: 'text/plain' });
        a.href = URL.createObjectURL(blob);
        a.download = blobName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        showStatus('Notiz wurde heruntergeladen.', 'success');
    } catch (error) {
        showStatus('Fehler beim Herunterladen der Notiz: ' + error.message, 'error');
        console.error('Download error:', error);
    }
}

// Notiz löschen
async function deleteNote(blobName) {
    if (confirm('Möchten Sie diese Notiz wirklich löschen?')) {
        try {
            // Blob Client erstellen
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            
            // Notiz löschen
            await blockBlobClient.delete();
            
            showStatus('Notiz wurde gelöscht.', 'success');
            
            // Notizen neu laden
            await listNotes();
        } catch (error) {
            showStatus('Fehler beim Löschen der Notiz: ' + error.message, 'error');
            console.error('Delete error:', error);
        }
    }
}

// Status-Nachricht anzeigen
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type; // CSS-Klasse setzen
}

// Stream in Text umwandeln
async function streamToText(readableStream) {
    const reader = readableStream.getReader();
    const decoder = new TextDecoder('utf-8');
    let result = '';
    
    let done = false;
    while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
            result += decoder.decode(value);
        }
    }
    
    return result;
}