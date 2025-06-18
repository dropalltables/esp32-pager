// Form submission functionality
document.getElementById('messageForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = document.getElementById('message').value;
  const authToken = document.getElementById('authToken').value;

  try {
    const response = await fetch('https://api.viruus.zip/esp32/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify({ message })
    });

    if (response.ok) {
      const data = await response.json();
      alert(`Success: ${data.message}`);
    } else {
      alert('Failed to send message. Check your auth token.');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred while sending the message');
  }
});

// WebSocket variables
let socket = null;
let isAuthenticated = false;
const authStatusElement = document.getElementById('authentication-status');

// WebSocket connection
const connectWebSocket = () => {
  const statusElement = document.getElementById('connection-status');
  const messagesList = document.getElementById('messages-list');
  
  // Update WebSocket URL to use the specific /esp32/ws endpoint
  socket = new WebSocket('wss://api.viruus.zip/esp32/ws');
  
  socket.onopen = () => {
    statusElement.textContent = 'WebSocket Status: Connected';
    statusElement.style.color = 'green';
    
    // Add a connection established message
    const connectionItem = document.createElement('li');
    connectionItem.textContent = `${new Date().toLocaleTimeString()} - Connection established`;
    messagesList.appendChild(connectionItem);
  };
  
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const messageItem = document.createElement('li');
      
      // Handle authentication response
      if (data.type === "auth") {
        if (data.status === "success") {
          isAuthenticated = true;
          authStatusElement.textContent = "Authentication Status: Authenticated";
          authStatusElement.style.color = "green";
          messageItem.textContent = `${new Date().toLocaleTimeString()} - WebSocket authenticated successfully`;
        } else {
          isAuthenticated = false;
          authStatusElement.textContent = "Authentication Status: Authentication Failed";
          authStatusElement.style.color = "red";
          messageItem.textContent = `${new Date().toLocaleTimeString()} - WebSocket authentication failed`;
        }
      } 
      // Format event messages
      else if (data.timestamp && data.event) {
        // Include IP address information if available
        const ipInfo = data.clientIP ? ` | IP: ${data.clientIP}` : '';
        messageItem.textContent = `${new Date(data.timestamp).toLocaleTimeString()} - ${data.event}${ipInfo}`;
      } else {
        messageItem.textContent = `${new Date().toLocaleTimeString()} - ${JSON.stringify(data)}`;
      }
      
      messagesList.appendChild(messageItem);
      
      // Auto-scroll to the bottom
      const container = document.getElementById('websocket-messages');
      container.scrollTop = container.scrollHeight;
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      
      // Handle plain text messages
      const messageItem = document.createElement('li');
      messageItem.textContent = `${new Date().toLocaleTimeString()} - ${event.data}`;
      messagesList.appendChild(messageItem);
    }
  };
  
  socket.onclose = () => {
    statusElement.textContent = 'WebSocket Status: Disconnected';
    statusElement.style.color = 'red';
    
    // Reset authentication status
    isAuthenticated = false;
    authStatusElement.textContent = "Authentication Status: Not Authenticated";
    authStatusElement.style.color = "inherit";
    
    // Add a disconnection message
    const disconnectionItem = document.createElement('li');
    disconnectionItem.textContent = `${new Date().toLocaleTimeString()} - Connection closed`;
    messagesList.appendChild(disconnectionItem);
    
    // Attempt to reconnect after a delay
    setTimeout(() => {
      const reconnectingItem = document.createElement('li');
      reconnectingItem.textContent = `${new Date().toLocaleTimeString()} - Attempting to reconnect...`;
      messagesList.appendChild(reconnectingItem);
      connectWebSocket();
    }, 5000);
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    statusElement.textContent = 'WebSocket Status: Error';
    statusElement.style.color = 'red';
    
    // Add an error message
    const errorItem = document.createElement('li');
    errorItem.textContent = `${new Date().toLocaleTimeString()} - Connection error`;
    messagesList.appendChild(errorItem);
  };
};

// Authentication button handler
document.getElementById('authenticateButton').addEventListener('click', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    alert('WebSocket is not connected. Please wait for the connection to establish.');
    return;
  }

  const authKey = prompt('Enter authentication key to access server logs:');
  
  if (authKey) {
    // Send authentication message
    socket.send(JSON.stringify({
      type: 'auth',
      key: authKey
    }));
  }
});

// Initialize WebSocket connection when the page loads
document.addEventListener('DOMContentLoaded', connectWebSocket);
