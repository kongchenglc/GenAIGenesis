# InSight: Browser Agent for the Visually Impaired (Chrome Extension)

## 📌 Motivation

This Chrome extension is designed to help **blind or visually impaired users** navigate websites **independently** using **AI-powered voice interaction**. By developing a robust browser agent and then integrating **speech recognition, AI-driven summarization, and smart multitasking**, the extension ensures a **seamless and accessible web experience**.

---

## 🔹 Key Features

### 🎙️ Voice-Controlled AI – Search & Web Navigation

✅ Users can **search and navigate** specific websites (e.g., **Amazon, live sports audio streaming**) via voice commands.  
✅ AI assists with **product searches, price comparisons, and checking live sports scores**.

### 🧠 AI-Powered Summarization & Read-Aloud

✅ Extracts **key content** from webpages (e.g., product details, articles, action buttons).  
✅ Generates **concise summaries** and reads them aloud to the user.  
✅ Highlights available **interactive actions**, such as **"Add to Cart"** or **"Play Audio"**.

### 🎤 Hands-Free Voice Commands

✅ Users can **control the browser** through voice, for example:

- "Go to my shopping cart"
- "Read the latest news headlines"
- "Summarize this article"

### 🌐 Smart Navigation & Multitasking

✅ **Smart Memory**

- The AI **remembers frequently visited websites**, providing **quick access via voice commands** for a more efficient browsing experience.

✅ **Seamless Multitasking**

- The AI **manages multiple browser tabs**, allowing users to switch between them using **voice commands**.
- Provides **real-time updates** (e.g., "Your sports page just updated the live score").
- AI **monitors important information** in the background and notifies users when necessary.

---

## 🔹 Core Technologies & Models

| Component                        | Technology / Model                                          |
| -------------------------------- | ----------------------------------------------------------- |
| **Speech-to-Text (STT)**         | Web Speech API                                              |
| **Text-to-Speech (TTS)**         | Web Speech Synthesis API                                    |
| **AI Summarization**             | OpenAI GPT-4 or LLaMA for text processing                   |
| **Web Interaction & Navigation** | Chrome Extensions API (Tabs, Scripting)                     |
| **Visual Content Processing**    | Computer Vision models (for analyzing webpage images/icons) |

---

## 🔹 Challenges & Considerations

🚧 **Meeting User Needs**: Some blind users may not frequently use web browsers, so the extension must be **intuitive** with minimal setup.  
🚧 **Voice Command Complexity**: Ensuring **accurate speech recognition** across different accents and speech patterns.  
🚧 **Complex Web Structures**: Websites have **varied HTML structures**, making it challenging to extract **relevant content** (e.g., product descriptions, headlines, interactive elements).  
🚧 **Real-Time Performance**: Ensuring **fast response times** for voice interactions and AI-generated summaries.  
🚧 **Security & Privacy**: Protecting user data, especially **voice recordings and browsing history**.

---

## 🔹 Future Enhancements

🔹 **Support for More Languages** (Multilingual speech recognition and synthesis).  
🔹 **Mobile Browser Compatibility** (Adaptation for Android/iOS browsers).  
🔹 **Advanced Image Recognition** (Using computer vision to describe images on webpages).  
🔹 **Personalized AI Recommendations** (AI learns user preferences and suggests relevant content).

---

## 🚀 Final Goal

To create an **AI-driven, voice-controlled web assistant** that enables **blind and visually impaired users** to **browse, navigate, and interact with websites effortlessly** using voice commands.
