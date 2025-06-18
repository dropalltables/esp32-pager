const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const port = 9000;
const API_KEY = "REDACTED FOR PRIVACY";

app.use(cors());
app.use(express.json());

let message = "Hello from the API server!";

const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (authHeader === API_KEY) {
    next();
  } else {
    res.status(401).send("Unauthorized");
  }
};

const getClientIP = (req) => {
  return req.headers['cf-connecting-ip'] || req.ip;
};

app.get("/esp32/messages", authenticate, (req, res) => {
  const clientIP = getClientIP(req);
  
  const checkEvent = {
    timestamp: new Date().toISOString(),
    event: "Device checked for new messages",
    clientIP: clientIP
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
      client.send(JSON.stringify(checkEvent));
    }
  });

  res.send(message);
});

app.post("/esp32/update", authenticate, (req, res) => {
  const receivedMessage = req.body.message;
  const clientIP = getClientIP(req);

  if (!receivedMessage) {
    return res.status(400).send("Message is required");
  }

  message = receivedMessage;

  console.log(`Message updated by IP ${clientIP}: ${message}`);

  const updateEvent = {
    timestamp: new Date().toISOString(),
    event: "Message updated",
    clientIP: clientIP
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
      client.send(JSON.stringify(updateEvent));
    }
  });

  res.send({ status: "success", message: "Message updated successfully" });
});

// New endpoint for reading messages
app.post("/esp32/read", authenticate, (req, res) => {
  const clientIP = getClientIP(req);

  console.log(`Message read by IP ${clientIP}`);

  const readEvent = {
    timestamp: new Date().toISOString(),
    event: "Message read",
    clientIP: clientIP
  };

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
      client.send(JSON.stringify(readEvent));
    }
  });

  res.send({ status: "success", message: "Message marked as read" });
});

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/esp32/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws, request) => {
  const clientIP = getClientIP(request);
  console.log(`New WebSocket connection established from IP: ${clientIP}`);

  ws.isAuthenticated = false;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "auth" && data.key === API_KEY) {
        ws.isAuthenticated = true;
        console.log(`WebSocket client authenticated from IP: ${clientIP}`);
        ws.send(JSON.stringify({ type: "auth", status: "success" }));
      } else if (data.type === "auth") {
        console.log(`Failed authentication attempt from IP: ${clientIP}`);
        ws.send(JSON.stringify({ type: "auth", status: "failed" }));
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  ws.on("close", () => {
    console.log(`WebSocket connection closed from IP: ${clientIP}`);
  });
});

server.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
  console.log(`WebSocket server running at ws://localhost:${port}/esp32/ws`);
});
