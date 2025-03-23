// Simple elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const transcriptDiv = document.getElementById("transcript");
const resultDiv = document.createElement("div");
resultDiv.id = "result";
document.body.appendChild(resultDiv);

// AssemblyAI API key
const API_KEY = "54d22de93cfc43e5936a7364a507da44";

// WebSocket connection
const ws = new WebSocket("ws://127.0.0.1:8000/ws");

ws.onopen = () => {
  console.log("Connected to WebSocket server");
  transcriptDiv.textContent = "Connected to server. Ready to record...";
};

// Handle messages from the WebSocket server
ws.onmessage = (event) => {
  console.log("Received message from server:", event.data);
  try {
    const response = JSON.parse(event.data);

    // Handle the summary and URL
    if (response.summary) {
      resultDiv.innerHTML = `<h3>Summary:</h3><p>${response.summary}</p>`;

      // Speak the summary out loud
      const utterance = new SpeechSynthesisUtterance(response.summary);
      speechSynthesis.speak(utterance);
    }

    // Navigate to URL if provided
    if (response.url) {
      resultDiv.innerHTML += `<h3>URL:</h3><p><a href="${response.url}" target="_blank">${response.url}</a></p>`;
      // Open the URL in a new tab
      window.open(response.url, "_blank");
    }
  } catch (error) {
    console.error("Error parsing WebSocket message:", error);
    resultDiv.textContent = "Error processing server response";
  }
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
  transcriptDiv.textContent = "Error connecting to server";
};

ws.onclose = () => {
  console.log("Disconnected from WebSocket server");
  transcriptDiv.textContent = "Disconnected from server";
};

// Variables for recording
let mediaRecorder;
let audioChunks = [];

// Start recording
startBtn.addEventListener("click", async () => {
  audioChunks = [];
  transcriptDiv.textContent = "Recording...";
  resultDiv.textContent = "";

  try {
    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create recorder
    mediaRecorder = new MediaRecorder(stream);

    // Collect audio chunks
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    // When stopped, process the audio
    mediaRecorder.onstop = async () => {
      transcriptDiv.textContent = "Processing...";

      // Create audio blob
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

      // Send to AssemblyAI
      sendToAssemblyAI(audioBlob);
    };

    // Start recording
    mediaRecorder.start();
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } catch (err) {
    transcriptDiv.textContent = "Error: " + err.message;
  }
});

// Stop recording
stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

// Function to send audio to AssemblyAI
async function sendToAssemblyAI(audioBlob) {
  try {
    // First upload the file
    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        Authorization: API_KEY,
      },
      body: audioBlob,
    });

    const uploadResult = await uploadResponse.json();

    // Then request transcription
    const transcriptResponse = await fetch(
      "https://api.assemblyai.com/v2/transcript",
      {
        method: "POST",
        headers: {
          Authorization: API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio_url: uploadResult.upload_url,
        }),
      }
    );

    const transcriptResult = await transcriptResponse.json();

    // Poll for result
    checkTranscriptStatus(transcriptResult.id);
  } catch (error) {
    transcriptDiv.textContent = "Error: " + error.message;
  }
}

// Function to check transcript status
async function checkTranscriptStatus(transcriptId) {
  try {
    const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;

    // Poll until complete
    while (true) {
      const pollingResponse = await fetch(pollingEndpoint, {
        method: "GET",
        headers: {
          Authorization: API_KEY,
        },
      });

      const transcriptionResult = await pollingResponse.json();

      if (transcriptionResult.status === "completed") {
        // Success! Show the transcript
        const transcribedText = transcriptionResult.text;
        transcriptDiv.textContent = "Transcript: " + transcribedText;

        // Send the transcribed text to WebSocket
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ text: transcribedText }));
          transcriptDiv.textContent +=
            "\n\nSent to WebSocket server. Waiting for response...";
        } else {
          transcriptDiv.textContent += "\n\nError: WebSocket not connected";
        }

        break;
      } else if (transcriptionResult.status === "error") {
        transcriptDiv.textContent =
          "Transcription error: " + transcriptionResult.error;
        break;
      } else {
        // Keep polling
        transcriptDiv.textContent =
          "Processing... " + transcriptionResult.status;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    transcriptDiv.textContent = "Polling error: " + error.message;
  }
}

console.log("Event listeners set up");
