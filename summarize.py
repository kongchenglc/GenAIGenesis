#!/usr/bin/env python3

"""
Fast Web Page Summarizer for Accessibility
Provides quick summaries and navigation options within 10 seconds
"""

import os
import sys
import asyncio
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import argparse
from urllib.parse import urljoin
from dotenv import load_dotenv
import traceback

import google.generativeai as genai
from playwright.async_api import async_playwright
from rich.console import Console

# Load environment variables
load_dotenv()

# Constants for timeouts and limits
PAGE_LOAD_TIMEOUT = 7  # seconds
ELEMENT_TIMEOUT = 0.2  # seconds for individual elements
CONTENT_TIMEOUT = 1    # seconds for content blocks
MAX_LINKS = 10
MAX_HEADINGS = 3
MIN_CONTENT_LENGTH = 50
MAX_SUMMARY_LENGTH = 500

console = Console()

@dataclass
class QuickPageContent:
    """Minimal data class for fast content extraction"""
    title: str
    main_links: Dict[str, str]  # text -> url mapping
    main_headings: List[str]
    quick_summary: str

class FastWebSummarizer:
    def __init__(self, api_key: Optional[str] = None):
        if api_key is None:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("Please provide a Google API key via GOOGLE_API_KEY environment variable")
        
        genai.configure(api_key=api_key)
        

        
        # Use gemini-2.0-flash-lite for all operations
        self.model = genai.GenerativeModel('models/gemini-2.0-flash-lite')
        self.browser = None
        self.current_page = None
        self.link_history = []

    async def start_browser(self):
        """Start a fast browser session"""
        p = await async_playwright().start()
        self.browser = await p.chromium.launch(
            headless=True,
            args=['--disable-javascript']  # Disable JS for faster loading
        )
        self.current_page = await self.browser.new_page()

    async def _safe_extract(self, coro: Any, timeout: float, default: Any = None) -> Any:
        """Safely extract content with timeout"""
        try:
            return await asyncio.wait_for(coro, timeout=timeout)
        except (asyncio.TimeoutError, Exception):
            return default
    
    async def _extract_specific_info(self, text: str, timeout: float, prompt: str, default: Any = None) -> Any:
        """Extract specific information from text content using Gemini"""
        try:
            if not text:
                return default
                
            cleaned_text = "\n".join(line.strip() for line in text.splitlines() if line.strip())
            context = cleaned_text[:15000]  # Trim for Gemini token limit

            # First get the raw information
            response = self.model.generate_content([
                f"Webpage content:\n{context}",
                f"User query: {prompt}\n\nBased on the above content, extract and summarize the relevant information about what the user asked. If no relevant information is found, say so clearly."
            ])
            raw_info = response.text

            # Then clean it up and make it more natural
            cleanup_prompt = f"""Given this information about {prompt}:
{raw_info}

Please rewrite this in a clear, natural way that:
1. Uses complete sentences
2. Is concise but informative
3. Focuses on the most relevant details
4. Avoids bullet points or lists
5. Sounds natural and conversational

Return only the cleaned up text, nothing else."""

            cleaned_response = self.model.generate_content(cleanup_prompt)
            return cleaned_response.text.strip()
        except Exception as e:
            return f"Error processing content: {str(e)}"

    async def get_specific_info(self, url: str, query: str) -> str:
        """Get specific information from the webpage based on user query"""
        try:
            if not self.current_page:
                await self.start_browser()

            # Load page and get content
            await self._safe_extract(
                self.current_page.goto(url, wait_until="domcontentloaded"),
                PAGE_LOAD_TIMEOUT
            )

            # Get all text content from main content areas
            content_selectors = [
                'main', 'article', '#content', '.content',
                '[role="main"]', '.main-content', '#main-content',
                'section', '.page-content', '[data-testid="content"]',
                'body'  # Fallback to entire body if no specific content area found
            ]
            
            all_content = []
            for selector in content_selectors:
                elements = await self.current_page.query_selector_all(selector)
                for element in elements:
                    text = await self._safe_extract(
                        element.text_content(),
                        CONTENT_TIMEOUT,
                        ""
                    )
                    if text and len(text.strip()) > MIN_CONTENT_LENGTH:
                        all_content.append(text.strip())

            # Combine all content
            combined_content = "\n\n".join(all_content)
            
            if not combined_content:
                return "Could not find any content on the page to analyze."

            # Use Gemini to extract relevant information
            info = await self._extract_specific_info(
                combined_content,
                CONTENT_TIMEOUT,
                query,
                "Could not find specific information about your query."
            )

            return info
        except Exception as e:
            console.print(f"[yellow]Warning during specific info extraction: {str(e)}[/yellow]")
            return "Could not extract specific information due to an error."

    async def _extract_elements(self, selector: str, extract_fn) -> List[Any]:
        """Generic element extraction with error handling"""
        try:
            elements = await self.current_page.query_selector_all(selector)
            results = []
            for element in elements:
                result = await self._safe_extract(extract_fn(element), ELEMENT_TIMEOUT)
                if result:
                    results.append(result)
            return results
        except Exception:
            return []

    async def quick_extract(self, url: str) -> QuickPageContent:
        """Extract only essential content with aggressive timeouts"""
        try:
            if not self.current_page:
                await self.start_browser()

            # Load page
            await self._safe_extract(
                self.current_page.goto(url, wait_until="domcontentloaded"),
                PAGE_LOAD_TIMEOUT
            )

            # Get title
            title = await self._safe_extract(
                self.current_page.title(),
                CONTENT_TIMEOUT,
                "Unknown Title"
            )

            # Extract navigation links
            main_links = {}
            nav_selectors = ['nav a[href]', 'header a[href]', '#nav-main a[href]', '.nav-links a[href]']
            for selector in nav_selectors:
                async def extract_link(element):
                    text = await element.text_content()
                    href = await element.get_attribute('href')
                    return (text.strip(), href) if text and href and len(text.strip()) < 50 else None

                links = await self._extract_elements(selector, extract_link)
                for text, href in links[:MAX_LINKS]:
                    if text and href:
                        main_links[text] = urljoin(url, href)

            # Extract headings
            async def extract_heading(element):
                text = await element.text_content()
                return text.strip() if text and text.strip() else None

            main_headings = await self._extract_elements('h1, h2', extract_heading)
            main_headings = main_headings[:MAX_HEADINGS]

            # Extract content
            content_selectors = [
                'main', 'article', '#content', '.content',
                '[role="main"]', '.main-content', '#main-content',
                'section:first-of-type', '.page-content',
                '[data-testid="content"]'
            ]
            
            quick_summary = ""
            for selector in content_selectors:
                if element := await self.current_page.query_selector(selector):
                    text = await self._safe_extract(
                        self.current_page.evaluate("""
                            (el) => {
                                const clone = el.cloneNode(true);
                                const nav = clone.querySelector('nav, header, footer');
                                if (nav) nav.remove();
                                return clone.textContent;
                            }
                        """, element),
                        CONTENT_TIMEOUT
                    )
                    if text and len(text.strip()) > MIN_CONTENT_LENGTH:
                        quick_summary = text.strip()[:MAX_SUMMARY_LENGTH]
                        break

            # Fallback to paragraphs if no content found
            if not quick_summary:
                async def extract_paragraph(element):
                    text = await element.text_content()
                    return text.strip() if text and len(text.strip()) > MIN_CONTENT_LENGTH else None

                paragraphs = await self._extract_elements('p', extract_paragraph)
                quick_summary = ' '.join(paragraphs[:3])[:MAX_SUMMARY_LENGTH]

            return QuickPageContent(
                title=title,
                main_links=main_links,
                main_headings=main_headings,
                quick_summary=quick_summary
            )

        except Exception as e:
            console.print(f"[yellow]Warning during extraction: {str(e)}[/yellow]")
            return QuickPageContent(
                title="Could not load page",
                main_links={},
                main_headings=[],
                quick_summary=""
            )
    

    def _build_quick_prompt(self, content: QuickPageContent) -> str:
        """Build a minimal prompt for fast processing"""
        return f"""Quick webpage summary:
Title: {content.title}
Main Headings: {' | '.join(content.main_headings)}
Brief Content: {content.quick_summary[:300]}

Provide a 1-2 sentence summary focused on the specific content of this page."""

    async def quick_summarize(self, url: str) -> Tuple[Dict, Dict[str, str]]:
        """Fast summarization method"""
        try:
            content = await self.quick_extract(url)
            response = self.model.generate_content(self._build_quick_prompt(content))
            return {"summary": response.text}, content.main_links
        except Exception as e:
            console.print(f"[yellow]Warning: {str(e)}[/yellow]")
            return {"summary": "Could not generate summary"}, {}

    async def close(self):
        """Clean up resources"""
        if self.browser:
            await self.browser.close()


def display_quick_summary(summary: Dict, links: Dict[str, str]):
    """Display a conversational summary and navigation options"""
    # Clear any previous output for cleaner display
    print("\n" + "="*80 + "\n")
    
    # Show the summary naturally
    print(f"{summary['summary']}\n")
    
    if not links:
        print("I don't see any navigation options on this page.")
        return
        
    # Clean up navigation options
    nav_options = {}  # text -> url mapping
    
    for text, url in links.items():
        # Clean up the text
        text = text.strip().replace('\n', ' ').replace('  ', ' ')
        
        # Skip very short or duplicate-looking links
        if len(text) < 2 or text.lower() in ['en', 'fr', '.com', '.ca']:
            continue
            
        nav_options[text] = url
        
        # Keep list manageable
        if len(nav_options) >= 7:
            break
    
    if nav_options:
        print("I can help you either ")
        print("navigate to a section: " + ", ".join(nav_options.keys()))
        print(", or help you get specific information on the page.")
    
    print("\nJust tell me what you'd like to do or know!")

    return summary, nav_options


def generate_nav_options(links: Dict[str, str]):
    nav_options = {}  # text -> url mapping
    
    for text, url in links.items():
        # Clean up the text
        text = text.strip().replace('\n', ' ').replace('  ', ' ')
        
        # Skip very short or duplicate-looking links
        if len(text) < 2 or text.lower() in ['en', 'fr', '.com', '.ca']:
            continue
            
        nav_options[text] = url
        
        # Keep list manageable
        if len(nav_options) >= 7:
            break
    
    return nav_options

def agent_output(summary: Dict, nav_options):
    text_response = summary['summary'] 

    if nav_options:
        text_response += f"\nI can take you to any of these sections: {', '.join(nav_options.keys())}."

    else:
        text_response += "\nJust tell me where you'd like to go!"
    
    return text_response, nav_options


def _match_user_intent(user_input: str, available_options: Dict[str, str], model) -> Optional[str]:
    """Use LLM to match user input to available navigation options or information requests"""
    # First check if user wants to exit
    if any(word in user_input.lower() for word in ['quit', 'exit', 'bye', 'goodbye', 'q', 'stop', 'end']):
        return 'EXIT'
    if any(word in user_input.lower() for word in ['back', 'previous']):
        return 'BACK'
        
    # Use Gemini to classify the user's intent
    prompt = f"""Given this user input: "{user_input}"

Classify the user's intent into one of these categories:
1. INFO_REQUEST - if they want to learn more or get specific information about something
2. NAVIGATION - if they want to navigate to a specific section
3. NONE - if neither of the above

Available navigation options: {list(available_options.keys())}

Return EXACTLY one of: INFO_REQUEST, NAVIGATION, or NONE"""

    try:
        response = model.generate_content(prompt)
        intent = response.text.strip().upper()
        
        if intent == 'INFO_REQUEST':
            return 'INFO_REQUEST'
        elif intent == 'NAVIGATION':
            # If it's a navigation request, try to match to specific option
            nav_prompt = f"""Given these available navigation options: {list(available_options.keys())}

User said: "{user_input}"

Which option (if any) are they most likely trying to navigate to? Return EXACTLY one of the available options if there's a match, or "none" if no good match.
Only return the matching text or "none", nothing else."""
            
            nav_response = model.generate_content(nav_prompt)
            match = nav_response.text.strip().strip('"').strip("'")
            return match if match in available_options else None
        else:
            return None
    except Exception:
        return None

async def agent_response(summarizer: FastWebSummarizer, initial_url: str):
    new_url = initial_url
    current_summary = None
    current_nav_options = None

    if not current_summary:  # Only get new summary if we don't have one
            summary, links = await summarizer.quick_summarize(new_url)
            current_summary, current_nav_options = display_quick_summary(summary, links)
        
    if not current_nav_options:
        current_summary += "\nLooks like we've reached a page without any navigation options."
        
    user_input = input().strip()
    matched_option = _match_user_intent(user_input, current_nav_options, summarizer.model)
    
    if matched_option == 'EXIT':
        current_summary +="\nAlright, hope that was helpful!"
    elif matched_option == 'BACK':
        current_summary +="\nGoing back to the previous page..."
        new_url = summarizer.link_history[-1]
        current_summary = None  # Reset summary for next pag
    elif matched_option == 'INFO_REQUEST':
        current_summary = {"text": ""}
        current_summary["text"] += "\nLet me search for that information..."
        specific_info = await summarizer.get_specific_info(new_url, user_input)
        current_summary["summary"] = specific_info
        current_summary["text"] += "\n" + "="*80 + "\n"
        current_summary["text"] += f"{specific_info}\n"
        current_summary["text"] += "I can help you in two ways:\n"
        current_summary["text"] += "1. Navigate to a section: " + ", ".join(current_nav_options.keys()) + "\n"
        current_summary["text"] += "2. Get specific information: Just ask about what you want to know (e.g., 'Tell me about pricing' or 'What are the team members?')\n"
        current_summary["text"] += "\nJust tell me what you'd like to do!"
        
    elif matched_option:
        if "text" not in current_summary:
            current_summary["text"] = ""
        current_summary["text"] += f"\nTaking you to {matched_option}..."
        new_url = current_nav_options[matched_option]
        current_summary["summary"] = None  # Reset summary for next page
        current_summary["text"] = "Going to new URL!"

    else:
        if "text" not in current_summary:
            current_summary["text"] = ""
        current_summary["text"] += "\nI'm not sure what you want to do. You can:\n"
        current_summary["text"] += "1. Navigate to a section: " + ", ".join(current_nav_options.keys()) + "\n"
        current_summary["text"] += "2. Ask for specific information on this page"

    
    return current_summary, new_url
            

async def url_to_print(summarizer: FastWebSummarizer, initial_url: str):
    new_url = initial_url
    current_summary = None
    current_nav_options = None
    

    while True:
        if not current_summary:  # Only get new summary if we don't have one
            summary, links = await summarizer.quick_summarize(new_url)
            current_summary, current_nav_options = display_quick_summary(summary, links)
        
        if not current_nav_options:
            print("\nLooks like we've reached a page without any navigation options.")
            
        user_input = input().strip()
        matched_option = _match_user_intent(user_input, current_nav_options, summarizer.model)
        
        if matched_option == 'EXIT':
            print("\nAlright, hope that was helpful!")
            break
        elif matched_option == 'BACK':
            print("\nGoing back to the previous page...")
            current_summary = None  # Reset summary for next pag
            break
        elif matched_option == 'INFO_REQUEST':
            print("\nLet me search for that information...")
            specific_info = await summarizer.get_specific_info(new_url, user_input)
            # Replace the current summary with the specific information
            current_summary = {"summary": specific_info}
            print("\n" + "="*80 + "\n")
            print(f"{specific_info}\n")
            print("I can help you in two ways:")
            print("1. Navigate to a section: " + ", ".join(current_nav_options.keys()))
            print("2. Get specific information: Just ask about what you want to know (e.g., 'Tell me about pricing' or 'What are the team members?')")
            print("\nJust tell me what you'd like to do!")
        elif matched_option:
            print(f"\nTaking you to {matched_option}...")
            new_url = current_nav_options[matched_option]
            current_summary = None  # Reset summary for next page
        else:
            print("\nI'm not sure what you want to do. You can:")
            print("1. Navigate to a section:", ", ".join(current_nav_options.keys()))
            print("2. Ask for specific information (e.g., 'Tell me about pricing')")
            
    await summarizer.close()

async def main():
    parser = argparse.ArgumentParser(description="Fast webpage summarizer for accessibility")
    parser.add_argument("url", help="URL of the webpage to summarize")
    parser.add_argument("--api-key", help="Google API Key (optional, can use GOOGLE_API_KEY env var)")
    args = parser.parse_args()

    print(f"Starting summarizer with URL: {args.url}")
    summarizer = None
    try:
        print("Initializing FastWebSummarizer...")
        summarizer = FastWebSummarizer(api_key=args.api_key)
        print("Getting summary and links...")
        summary, links = await summarizer.quick_summarize(args.url)
        print("Generating navigation options...")
        nav_options = generate_nav_options(links)
        print("Generating agent response...")
        text_response, nav_options = agent_output(summary, nav_options)
        print("Starting interactive session...")
        await url_to_print(summarizer, args.url)
    except KeyboardInterrupt:
        print("\n\nGot it, stopping now!")
    except Exception as e:
        print(f"\nError: {str(e)}")
        traceback.print_exc()
        sys.exit(1)
    finally:
        if summarizer:
            await summarizer.close()

if __name__ == "__main__":
    print("Script started")
    asyncio.run(main())