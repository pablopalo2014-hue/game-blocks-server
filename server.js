const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

console.log("================================");
console.log("GAME BLOCKS SERVER NUEVO");
console.log("NEWS ROUTE ACTIVADA");
console.log("================================");

app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Set();

const positions = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
];


// =====================================================
// QUE HAY DE NUEVO
// =====================================================

const queHayDeNuevo = `
Hola viajero, no hay ningun update por ahora, sigue jugando tranquilo.

Recuerda que hemos añadido:
- nuevo juego
- cosas en desarrollo
- mejoras a la web
- avatares
- reportes
- entre otras cosas

Si al abrir el juego sale que lo reinstales, es por una actualizacion.
Por ahora no hay nada.
`;

app.get("/news", (req, res) => {
    res.status(200);
    res.type("text/plain");
    res.send(queHayDeNuevo);
});

// =====================================================
// ACTUALIZACION
// =====================================================

const actualizacionProgramada = false;

const mensajeActualizacion =
    "Game Blocks se actualizará próximamente.";

const fechaActualizacion =
    "Próximamente";

app.get("/news", (req, res) => {
    res.send(queHayDeNuevo);
});

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
    "discord",
    "discord name",
    "usuario de discord",
    "vortex",
    "dis-cord",
    "hostias"
];


// =====================================================
// API PRINCIPAL
// =====================================================

app.get("/", (req, res) => {

    res.status(200);

    res.setHeader(
        "Content-Type",
        "text/plain; charset=utf-8"
    );

    res.send(
        "Game Blocks API funcionando correctamente"
    );

});


// =====================================================
// NEWS
// =====================================================

app.get("/news", (req, res) => {

    res.status(200);

    res.setHeader(
        "Content-Type",
        "text/plain; charset=utf-8"
    );

    res.send(queHayDeNuevo);

});


// =====================================================
// CHAT
// =====================================================

app.post("/chat", (req, res) => {

    const message = req.body.message;


    // =================================================
    // COMPROBAR MENSAJE
    // =================================================

    if (!message || typeof message !== "string") {

        return res.status(400).json({

            success: false,

            blocked: false,

            message: "Mensaje inválido"

        });

    }


    const cleanMessage = message.trim();


    if (cleanMessage.length === 0) {

        return res.status(400).json({

            success: false,

            blocked: false,

            message: "Mensaje vacío"

        });

    }


    // =================================================
    // COMPROBAR PALABRAS PROHIBIDAS
    // =================================================

    const lowerMessage =
        cleanMessage.toLowerCase();


    const containsBadWord =
        bannedWords.some(word => {

            return lowerMessage.includes(
                word.toLowerCase()
            );

        });


    // =================================================
    // MENSAJE CENSURADO
    // =================================================

    if (containsBadWord) {

        console.log(
            "Mensaje censurado:",
            cleanMessage
        );


        return res.json({

            success: false,

            blocked: true,

            message:
                "[CENSURADO POR LA MODERACION]"

        });

    }


    // =================================================
    // MENSAJE NORMAL
    // =================================================

    console.log(
        "Mensaje aceptado:",
        cleanMessage
    );


    const data = JSON.stringify({

        type: "chat_message",

        message: cleanMessage

    });


    // =================================================
    // ENVIAR A TODOS LOS JUGADORES
    // =================================================

    for (const player of players) {

        if (
            player.readyState === WebSocket.OPEN
        ) {

            player.send(data);

        }

    }


    // =================================================
    // RESPUESTA A GODOT
    // =================================================

    res.json({

        success: true,

        blocked: false,

        message: cleanMessage

    });

});


// =====================================================
// WEBSOCKET
// =====================================================

wss.on("connection", (socket) => {


    // =================================================
    // MÁXIMO 2 JUGADORES
    // =================================================

    if (players.size >= 2) {

        console.log(
            "Servidor lleno. Conexión rechazada."
        );

        socket.close();

        return;

    }


    // =================================================
    // REGISTRAR JUGADOR
    // =================================================

    players.add(socket);

    const slot = players.size - 1;

    socket.slot = slot;


    console.log(
        "Jugador conectado. Slot:",
        slot + 1,
        "Jugadores:",
        players.size
    );


    // =================================================
    // ENVIAR POSICIONES ACTUALES
    // =================================================

    socket.send(
        JSON.stringify({

            type: "positions",

            positions: positions

        })
    );


    // =================================================
    // MENSAJES DEL JUGADOR
    // =================================================

    socket.on("message", (message) => {

        try {

            const data = JSON.parse(
                message.toString()
            );


            // =================================================
            // POSICION
            // =================================================

            if (data.type !== "position") {

                return;

            }


            const x = Number(data.x);

            const y = Number(data.y);

            const z = Number(data.z);


            // =================================================
            // COMPROBAR COORDENADAS
            // =================================================

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                !Number.isFinite(z)
            ) {

                return;

            }


            // =================================================
            // GUARDAR POSICION
            // =================================================

            positions[socket.slot] = {

                x: x,

                y: y,

                z: z

            };


            // =================================================
            // ENVIAR POSICIONES
            // =================================================

            const response = JSON.stringify({

                type: "positions",

                positions: positions

            });


            for (const player of players) {

                if (
                    player.readyState === WebSocket.OPEN
                ) {

                    player.send(response);

                }

            }

        } catch (error) {

            console.log(
                "Paquete WebSocket inválido."
            );

        }

    });


    // =================================================
    // DESCONEXION
    // =================================================

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


    // =================================================
    // ERROR WEBSOCKET
    // =================================================

    socket.on("error", (error) => {

        console.log(
            "Error WebSocket:",
            error
        );

    });

});


// =====================================================
// SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "Servidor iniciado en el puerto " + PORT
        );

    }
);
