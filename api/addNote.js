const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = "notizen";
const containerId = "eintraege";

const client = new CosmosClient({ endpoint, key });

module.exports = async function (context, req) {
    const { title, content } = req.body;

    if (!title || !content) {
        context.res = { status: 400, body: "Titel und Inhalt erforderlich." };
        return;
    }

    try {
        const db = client.database(databaseId);
        const container = db.container(containerId);

        const newItem = {
            id: `${Date.now()}`, // eindeutige ID
            title,
            content,
            createdAt: new Date().toISOString()
        };

        await container.items.create(newItem);

        context.res = {
            status: 200,
            body: { message: "Notiz gespeichert", item: newItem }
        };
    } catch (err) {
        context.res = {
            status: 500,
            body: "Fehler beim Speichern: " + err.message
        };
    }
};
