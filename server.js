
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Set();

const positions = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
];


// =====================================================
// QUE HAY DE NUEVO / ACTUALIZACIÓN
// =====================================================

// EDITA ESTOS DATOS DESDE GITHUB

const queHayDeNuevo = `
Hola viajero , no hay ningun update por ahora , sigue jugando tranquilo.
Recuerda que hemos añadido:
- nuevo juego
- cosas en desarrollo
- mejoras a la web
- avatares
- reportes
- entre otras cosas
Si al abrir el juego sale que lo reinstales, es por una actualizacion por ahora no hay nada.
`;

const actualizacionProgramada = true;

const mensajeActualizacion = "Game Blocks se actualizará próximamente.";

const fechaActualizacion = "Próximamente";


// =====================================================
// PALABRAS PROHIBIDAS
// =====================================================

const bannedWords = [
    "joder",
    "coño",
    "mierda",
    "puta",
    "puto",
    "gilipollas",
    "cabron",
    "cabrón",
    "idiota",
    "imbecil",
    "imbécil",
    "hostia",
    "roblox",
    "Roblox",
    "Roblox.com",
    "discord",
    "discord name",
    "usuario de discord",
    "vortex",
    "Vortex",
    "dis-cord",
    "Dis-cord",
    "hostias"
];


// =====================================================
// INICIO
// =====================================================

app.get("/", (req, res) => {
    res.send("Servidor funcionando");
});


// =====================================================
// QUE HAY DE NUEVO
// =====================================================

app.get("/news", (req, res) => {

    res.json({
        queHayDeNuevo: queHayDeNuevo,
        actualizacionProgramada: actualizacionProgramada,
        mensajeActualizacion: mensajeActualizacion,
        fechaActualizacion: fechaActualizacion
    });

});


// =====================================================
// CHAT
// =====================================================

app.post("/chat", (req, res) => {

    const message = req.body.message;

    if (!message || typeof message !== "string") {

        return res.status(400).json({
            error: "Mensaje inválido"
        });
    }

    const lowerMessage = message.toLowerCase();

    const containsBadWord = bannedWords.some(word => {
        return lowerMessage.includes(word.toLowerCase());
    });

    if (containsBadWord) {

        console.log("Mensaje bloqueado:", message);

        return res.json({
            success: false,
            blocked: true
        });
    }

    console.log("Mensaje aceptado:", message);

    const data = JSON.stringify({
        type: "chat_message",
        message: message
    });

    for (const player of players) {

        if (player.readyState === WebSocket.OPEN) {
            player.send(data);
        }
    }

    res.json({
        success: true,
        blocked: false
    });
});


// =====================================================
// WEBSOCKET
// =====================================================

wss.on("connection", (socket) => {

    // Máximo 2 jugadores
    if (players.size >= 2) {

        socket.close();

        return;
    }


    players.add(socket);

    // El slot se asigna internamente
    const slot = players.size - 1;

    socket.slot = slot;


    console.log(
        "Jugador conectado. Slot:",
        slot + 1,
        "Jugadores:",
        players.size
    );


    // Enviar posiciones actuales
    socket.send(JSON.stringify({
        type: "positions",
        positions: positions
    }));


    socket.on("message", (message) => {

        try {

            const data = JSON.parse(message.toString());


            if (data.type !== "position") {
                return;
            }


            const x = Number(data.x);
            const y = Number(data.y);
            const z = Number(data.z);


            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                !Number.isFinite(z)
            ) {

                return;
            }


            positions[socket.slot] = {
                x: x,
                y: y,
                z: z
            };


            // Mandar las posiciones a todos
            const response = JSON.stringify({
                type: "positions",
                positions: positions
            });


            for (const player of players) {

                if (player.readyState === WebSocket.OPEN) {
                    player.send(response);
                }
            }

        } catch (error) {

            console.log("Paquete inválido");
        }
    });


    socket.on("close", () => {

        players.delete(socket);


        positions[socket.slot] = {
            x: 0,
            y: 0,
            z: 0
        };


        console.log(
            "Jugador desconectado. Jugadores:",
            players.size
        );
    });
});


// =====================================================
// SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Servidor iniciado en el puerto ${PORT}`
    );
});
