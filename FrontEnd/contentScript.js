// Content script for handling webpage interactions

// Track the current focus element
let currentFocusElement = null;

// Initialize the content script
function initialize() {
    setupKeyboardNavigation();
    setupFocusTracking();
    setupAccessibilityEnhancements();
}

// Setup keyboard navigation
function setupKeyboardNavigation() {
    document.addEventListener('keydown', (event) => {
        // Alt + R to start reading from current position
        if (event.altKey && event.key === 'r') {
            event.preventDefault();
            readFromCurrentPosition();
        }
        
        // Alt + S to summarize the current section
        if (event.altKey && event.key === 's') {
            event.preventDefault();
            summarizeCurrentSection();
        }
    });
}

// Setup focus tracking
function setupFocusTracking() {
    document.addEventListener('focusin', (event) => {
        currentFocusElement = event.target;
        highlightFocusedElement(event.target);
    });

    document.addEventListener('focusout', (event) => {
        removeHighlight(event.target);
    });
}

// Enhance accessibility of the page
function setupAccessibilityEnhancements() {
    // Add ARIA labels to unlabeled buttons and links
    const elements = document.querySelectorAll('button, a');
    elements.forEach(element => {
        if (!element.getAttribute('aria-label') && !element.textContent.trim()) {
            const possibleLabel = findPossibleLabel(element);
            if (possibleLabel) {
                element.setAttribute('aria-label', possibleLabel);
            }
        }
    });

    // Add role attributes to ambiguous elements
    const divButtons = document.querySelectorAll('div[onclick]');
    divButtons.forEach(div => {
        if (!div.getAttribute('role')) {
            div.setAttribute('role', 'button');
        }
    });
}

// Helper function to find possible labels for elements
function findPossibleLabel(element) {
    // Check for images
    const img = element.querySelector('img');
    if (img && img.alt) {
        return img.alt;
    }

    // Check for icon fonts
    const icon = element.querySelector('i[class*="icon"], span[class*="icon"]');
    if (icon) {
        const className = icon.className;
        const matches = className.match(/icon-(\w+)/);
        if (matches) {
            return matches[1].replace('-', ' ');
        }
    }

    // Check for nearby text
    const next = element.nextElementSibling;
    if (next && next.textContent.trim()) {
        return next.textContent.trim();
    }

    return null;
}

// Highlight the focused element
function highlightFocusedElement(element) {
    element.style.outline = '2px solid #4A90E2';
    element.style.outlineOffset = '2px';
}

// Remove highlight from element
function removeHighlight(element) {
    element.style.outline = '';
    element.style.outlineOffset = '';
}

// Read content from current position
function readFromCurrentPosition() {
    let textToRead = '';
    
    if (currentFocusElement) {
        // If we have a focused element, start reading from there
        textToRead = extractReadableContent(currentFocusElement);
    } else {
        // Otherwise, try to find the main content
        const mainContent = document.querySelector('main, article, [role="main"]') || document.body;
        textToRead = extractReadableContent(mainContent);
    }

    // Send message to background script to read the text
    chrome.runtime.sendMessage({
        action: 'readText',
        text: textToRead
    });
}

// Summarize current section
function summarizeCurrentSection() {
    let sectionToSummarize = '';
    
    if (currentFocusElement) {
        // Find the closest section-like container
        const section = currentFocusElement.closest('section, article, .section, [role="region"]');
        if (section) {
            sectionToSummarize = extractReadableContent(section);
        } else {
            sectionToSummarize = extractReadableContent(currentFocusElement);
        }
    }

    // Send message to background script to summarize the text
    chrome.runtime.sendMessage({
        action: 'summarize',
        text: sectionToSummarize
    });
}

// Extract readable content from an element
function extractReadableContent(element) {
    // Clone the element to avoid modifying the actual page
    const clone = element.cloneNode(true);
    
    // Remove hidden elements
    const hiddenElements = clone.querySelectorAll('[aria-hidden="true"], [hidden], script, style');
    hiddenElements.forEach(el => el.remove());
    
    // Get text content
    return clone.innerText
        .replace(/\s+/g, ' ')
        .trim();
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'getPageContent':
            sendResponse({ content: extractReadableContent(document.body) });
            break;
        case 'focusElement':
            const element = document.querySelector(request.selector);
            if (element) {
                element.focus();
                highlightFocusedElement(element);
            }
            break;
    }
    return true;
});

// Initialize when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
} 