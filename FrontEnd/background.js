// Configuration for OpenAI API
const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
let API_KEY = ''; // Will be set through settings

// Load API key from storage
chrome.storage.sync.get(['openaiApiKey'], (result) => {
    if (result.openaiApiKey) {
        API_KEY = result.openaiApiKey;
    }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'search':
            handleSearch(request.searchTerm);
            break;
        case 'navigate':
            handleNavigation(request.website);
            break;
        case 'readPage':
            handlePageReading(sender.tab.id);
            break;
        case 'summarize':
            handleSummarization(sender.tab.id);
            break;
        case 'switchTab':
            handleTabSwitch(request.tabNumber);
            break;
    }
    return true; // Indicates async response
});

async function handleSearch(searchTerm) {
    try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
        const tab = await chrome.tabs.create({ url });
        await speakText(`Searching for ${searchTerm}`);
    } catch (error) {
        console.error('Search error:', error);
    }
}

async function handleNavigation(website) {
    try {
        let url = website;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        const tab = await chrome.tabs.create({ url });
        await speakText(`Navigating to ${website}`);
    } catch (error) {
        console.error('Navigation error:', error);
    }
}

async function handlePageReading(tabId) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: extractPageContent
        });
        
        const content = result[0].result;
        await speakText(content);
    } catch (error) {
        console.error('Page reading error:', error);
    }
}

async function handleSummarization(tabId) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: extractPageContent
        });
        
        const content = result[0].result;
        const summary = await generateSummary(content);
        await speakText(summary);
    } catch (error) {
        console.error('Summarization error:', error);
    }
}

async function handleTabSwitch(tabNumber) {
    try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        if (tabNumber > 0 && tabNumber <= tabs.length) {
            await chrome.tabs.update(tabs[tabNumber - 1].id, { active: true });
            await speakText(`Switched to tab ${tabNumber}`);
        } else {
            await speakText(`Tab ${tabNumber} does not exist`);
        }
    } catch (error) {
        console.error('Tab switch error:', error);
    }
}

// Helper function to extract page content
function extractPageContent() {
    const article = document.querySelector('article') || document.body;
    return article.innerText
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // Limit content length
}

// Helper function to generate summary using OpenAI API
async function generateSummary(content) {
    if (!API_KEY) {
        return 'Please set your OpenAI API key in the extension settings.';
    }

    try {
        const response = await fetch(OPENAI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that summarizes web content concisely.'
                    },
                    {
                        role: 'user',
                        content: `Please summarize the following text in a clear and concise way, suitable for visually impaired users: ${content}`
                    }
                ],
                max_tokens: 150
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Summary generation error:', error);
        return 'Error generating summary. Please try again.';
    }
}

// Helper function to speak text
async function speakText(text) {
    return new Promise((resolve, reject) => {
        chrome.tts.speak(text, {
            onEvent: function(event) {
                if (event.type === 'end') {
                    resolve();
                } else if (event.type === 'error') {
                    reject(new Error('TTS Error: ' + event.errorMessage));
                }
            }
        });
    });
}

// Handle installation and updates
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.runtime.openOptionsPage();
    }
}); 