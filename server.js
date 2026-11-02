const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "20mb" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Set();
const positions = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];

// Pon aqui el ID de un juego publicado para establecerlo como Featured.
const FEATURED_GAME_ID = "PON_AQUI_EL_ID";

const gamesDirectory = path.join(__dirname, "games");
const gamesDatabase = path.join(__dirname, "games.json");

if (!fs.existsSync(gamesDirectory)) fs.mkdirSync(gamesDirectory, { recursive: true });
if (!fs.existsSync(gamesDatabase)) fs.writeFileSync(gamesDatabase, "[]", "utf8");

function readGames() {
    try {
        const data = JSON.parse(fs.readFileSync(gamesDatabase, "utf8"));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Error leyendo games.json:", error);
        return [];
    }
}

function validGame(game) {
    return !!game &&
        typeof game.id === "string" &&
        typeof game.name === "string" &&
        typeof game.file === "string" &&
        game.file.endsWith(".tscn") &&
        path.basename(game.file) === game.file;
}

function loadGame(game) {
    if (!validGame(game)) return null;
    const filePath = path.join(gamesDirectory, game.file);
    if (!fs.existsSync(filePath)) return null;
    const scene = fs.readFileSync(filePath, "utf8");
    if (!scene.startsWith("[gd_scene")) return null;
    return { success: true, id: game.id, name: game.name, scene: scene };
}

app.get("/", (req, res) => {
    res.status(200).send("Game Blocks API funcionando correctamente");
});

app.get("/health", (req, res) => {
    res.status(200).json({ success: true, server: "Game Blocks", status: "online" });
});

const newsMessage = [
    "Nueva update , si no actualizaste el juego despes del 2 de noviembre de 2026, hazlo ya",
    "",
    "Recuerda que hemos añadido:",
    "- publicar juegos",
    "- cosas en desarrollo",
    "- mejoras a la web",
    "- avatares",
    "- reportes",
    "- bloques",
    "- entre otras cosas",
    "",
    "Si al abrir el juego sale que lo reinstales, es por una actualizacion.",
    "Por ahora no hay nada."
].join("\n");

app.get("/news", (req, res) => {
    res.type("text/plain").send(newsMessage);
});

// Publicar un juego nuevo.
app.post("/games/publish", (req, res) => {
    const configuredToken = process.env.PUBLISH_TOKEN;

    if (configuredToken) {
        const authorization = req.headers.authorization || "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (token !== configuredToken) {
            return res.status(401).json({ success: false, message: "No tienes permiso para publicar." });
        }
    }

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const scene = typeof req.body.scene === "string" ? req.body.scene : "";

    if (!name || name.length > 80) {
        return res.status(400).json({ success: false, message: "Nombre no valido (maximo 80 caracteres)." });
    }
    if (!scene.startsWith("[gd_scene")) {
        return res.status(400).json({ success: false, message: "La escena TSCN no es valida." });
    }

    const games = readGames();
    let id;
    do {
        id = String(Math.floor(100000 + Math.random() * 900000));
    } while (games.some((game) => String(game.id) === id));

    const file = "game_" + id + ".tscn";
    const filePath = path.join(gamesDirectory, file);

    try {
        fs.writeFileSync(filePath, scene, "utf8");
        const game = { id: id, name: name, file: file };
        games.push(game);
        fs.writeFileSync(gamesDatabase, JSON.stringify(games, null, 2), "utf8");
        console.log("Juego publicado: " + name + " (ID " + id + ")");
        return res.status(200).json({ success: true, message: "Juego publicado correctamente.", game: game });
    } catch (error) {
        console.error("Error publicando juego:", error);
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
        return res.status(500).json({ success: false, message: "No se pudo guardar el juego." });
    }
});

// Descargar el juego Featured configurado arriba.
app.get("/games/featured", (req, res) => {
    if (!FEATURED_GAME_ID || FEATURED_GAME_ID === "PON_AQUI_EL_ID") {
        return res.status(404).json({ success: false, message: "No se ha configurado ningun juego Featured." });
    }

    const game = readGames().find((item) => validGame(item) && String(item.id) === String(FEATURED_GAME_ID));
    if (!game) {
        return res.status(404).json({ success: false, message: "No existe el juego Featured con ID " + FEATURED_GAME_ID + "." });
    }

    try {
        const result = loadGame(game);
        if (!result) return res.status(404).json({ success: false, message: "No se encontro el archivo Featured." });
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error leyendo Featured:", error);
        return res.status(500).json({ success: false, message: "Error leyendo Featured." });
    }
});

// Descargar el ultimo juego publicado (ultima entrada de games.json).
app.get("/games/latest", (req, res) => {
    const games = readGames();
    const game = [...games].reverse().find((item) =>
        validGame(item) && fs.existsSync(path.join(gamesDirectory, item.file))
    );

    if (!game) {
        return res.status(404).json({ success: false, message: "Todavia no hay juegos publicados." });
    }

    try {
        const result = loadGame(game);
        if (!result) return res.status(404).json({ success: false, message: "No se encontro el archivo del ultimo juego." });
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error leyendo el ultimo juego:", error);
        return res.status(500).json({ success: false, message: "Error leyendo el ultimo juego." });
    }
});

// Descargar un juego aleatorio.
app.get("/games/random", (req, res) => {
    const games = readGames().filter((item) =>
        validGame(item) && fs.existsSync(path.join(gamesDirectory, item.file))
    );

    if (games.length === 0) {
        return res.status(404).json({ success: false, message: "Todavia no hay juegos publicados." });
    }

    const game = games[Math.floor(Math.random() * games.length)];
    try {
        const result = loadGame(game);
        if (!result) return res.status(404).json({ success: false, message: "El archivo del juego no existe o no es valido." });
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error leyendo juego aleatorio:", error);
        return res.status(500).json({ success: false, message: "Error leyendo juego aleatorio." });
    }
});

// Chat con filtro de palabras.
const bannedWords = [
    "joder", "coño", "mierda", "puta", "puto", "gilipollas",
    "cabron", "cabrón", "idiota", "imbecil", "imbécil",
    "hostia", "roblox", "discord", "discord name",
    "usuario de discord", "vortex", "dis-cord", "hostias"
];

app.post("/chat", (req, res) => {
    const message = req.body.message;
    if (typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ success: false, blocked: false, message: "Mensaje invalido o vacio." });
    }

    const cleanMessage = message.trim();
    const lowerMessage = cleanMessage.toLowerCase();
    const blocked = bannedWords.some((word) => lowerMessage.includes(word.toLowerCase()));

    if (blocked) {
        console.log("Mensaje censurado:", cleanMessage);
        return res.json({ success: false, blocked: true, message: "[CENSURADO POR LA MODERACION]" });
    }

    const packet = JSON.stringify({ type: "chat_message", message: cleanMessage });
    for (const player of players) {
        if (player.readyState === WebSocket.OPEN) player.send(packet);
    }
    return res.json({ success: true, blocked: false, message: cleanMessage });
});

// WebSocket: maximo 2 jugadores.
wss.on("connection", (socket) => {
    if (players.size >= 2) {
        console.log("Servidor lleno. Conexion rechazada.");
        socket.close();
        return;
    }

    players.add(socket);
    socket.slot = players.size - 1;
    console.log("Jugador conectado. Slot:", socket.slot + 1, "Jugadores:", players.size);

    socket.send(JSON.stringify({ type: "positions", positions: positions }));

    socket.on("message", (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type !== "position") return;

            const x = Number(data.x);
            const y = Number(data.y);
            const z = Number(data.z);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

            positions[socket.slot] = { x: x, y: y, z: z };
            const packet = JSON.stringify({ type: "positions", positions: positions });
            for (const player of players) {
                if (player.readyState === WebSocket.OPEN) player.send(packet);
            }
        } catch (error) {
            console.log("Paquete WebSocket invalido.");
        }
    });

    socket.on("close", () => {
        players.delete(socket);
        positions[socket.slot] = { x: 0, y: 0, z: 0 };
        console.log("Jugador desconectado. Jugadores:", players.size);
    });

    socket.on("error", (error) => console.log("Error WebSocket:", error));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor de Game Blocks iniciado en el puerto " + PORT);
});
