console.log("popup.js loaded");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const transcriptDiv = document.getElementById("transcript");

const assemblyApiKey = "54d22de93cfc43e5936a7364a507da44";
let mediaRecorder;
let audioChunks = [];

startBtn.addEventListener("click", () => {
  chrome.tabs.create({
    url: "recorder.html",
  });
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

async function uploadAudio(blob) {
  const response = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      authorization: assemblyApiKey,
    },
    body: blob,
  });

  if (!response.ok) throw new Error("Upload failed");

  const json = await response.json();
  return json.upload_url;
}

async function transcribeAudio(audioUrl) {
  // Step 1: Start transcription job
  const startResponse = await fetch(
    "https://api.assemblyai.com/v2/transcript",
    {
      method: "POST",
      headers: {
        authorization: assemblyApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ audio_url: audioUrl }),
    }
  );

  if (!startResponse.ok) throw new Error("Failed to start transcription");

  const { id } = await startResponse.json();

  // Step 2: Poll for completion
  while (true) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      {
        headers: { authorization: assemblyApiKey },
      }
    );

    const data = await pollRes.json();

    if (data.status === "completed") return data.text;
    if (data.status === "error") throw new Error(data.error);
  }
}
