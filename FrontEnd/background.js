// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    // Send message to content script to show permission page
    chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_PERMISSION_PAGE'
    });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_PERMISSION_PAGE') {
        // Create a new tab to open permission page
        chrome.tabs.create({ url: message.url });
    } else if (message.type === 'PERMISSION_GRANTED') {
        console.log('Microphone permission granted');
        // Can perform other operations here, such as updating extension icon
    } else if (message.type === 'PERMISSION_DENIED') {
        console.log('Microphone permission denied');
        // Can perform other operations here, such as updating extension icon
    } else if (message.type === 'START_VOICE_RECOGNITION') {
        console.log('Starting voice recognition');
        // Handle logic after space key long press when permission is already granted
        // Can communicate with permission.js to start voice recognition
    }
});
