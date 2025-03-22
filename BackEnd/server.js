import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";
import HTMLRouter from "./Router/HTMLRouter.js";
import VoiceRouter from "./Router/VoiceRouter.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/HTML", HTMLRouter);
app.use("/api/Voice", VoiceRouter);

// WebSocket connection handling
// wss.on('connection', (ws) => {
//     console.log('New WebSocket connection established');
//     ws.on('message', async (message) => {
//         try {
//             const data = JSON.parse(message);
//             // Handle different types of messages from the extension
//             switch(data.type) {
//                 case 'HTML_CONTENT':
//                     // Process HTML content and generate AI response
//                     // TODO: Implement AI processing
//                     ws.send(JSON.stringify({
//                         type: 'AI_RESPONSE',
//                         content: 'AI processed response'
//                     }));
//                     break;
//                 case 'VOICE_COMMAND':
//                     // Process voice commands
//                     // TODO: Implement voice command processing
//                     ws.send(JSON.stringify({
//                         type: 'COMMAND_RESPONSE',
//                         content: 'Command processed'
//                     }));
//                     break;
//             }
//         } catch (error) {
//             console.error('Error processing message:', error);
//             ws.send(JSON.stringify({
//                 type: 'ERROR',
//                 content: 'Error processing request'
//             }));
//         }
//     });

//     ws.on('close', () => {
//         console.log('Client disconnected');
//     });
// });




const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
