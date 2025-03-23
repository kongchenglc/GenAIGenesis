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
from urllib.parse import urljoin, urlparse
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


def format_summary(summary: Dict, links: Dict[str, str]) -> Tuple[Dict, Dict[str, str]]:
    """Format summary and navigation options into a response"""
    # Format the response text
    response_text = f"{summary['summary']}\n"
    
    if not links:
        response_text += "\nI don't see any navigation options on this page."
    else:
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
            response_text += "\nI can help you either "
            response_text += "navigate to a section: " + ", ".join(nav_options.keys())
            response_text += ", or help you get specific information on the page."
        
        response_text += "\n\nJust tell me what you'd like to do or know!"

    return {"summary": response_text}, nav_options


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

def is_url(string):
    parsed = urlparse(string)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)

async def agent_response(summarizer: FastWebSummarizer, user_input: str):
    new_url = None
    current_summary = None
    current_nav_options = {}

    try:
        # First handle URL input
        if is_url(user_input):
            new_url = user_input
            summarizer.link_history.append(new_url)  # Append URL directly, not in a list
            summary, links = await summarizer.quick_summarize(new_url)
            current_summary = summary
            current_nav_options = links
        else:
            # If not a URL, we're handling a command or query

            new_url = summarizer.link_history[-1]
            summary, links = await summarizer.quick_summarize(new_url)
            current_summary = summary
            current_nav_options = links
            matched_option = _match_user_intent(user_input, current_nav_options, summarizer.model)

            if matched_option == 'EXIT':
                current_summary["summary"] = "Alright, hope that was helpful!"
            elif matched_option == 'BACK':
                if len(summarizer.link_history) > 1:  # Use len() instead of .length
                    current_summary["summary"] = "Going back to the previous page..."
                    new_url = summarizer.link_history[-2]
                else:
                    current_summary["summary"] = "You're already on the first page!"
            elif matched_option == 'INFO_REQUEST':
                specific_info = await summarizer.get_specific_info(new_url, user_input)
                current_summary = {
                    "summary": f"Here's what I found:\n{specific_info}\n\n"
                    "I can help you in two ways:\n"
                    f"1. Navigate to a section: {', '.join(current_nav_options.keys())}\n"
                    "2. Ask another question about this page"
                }
            elif matched_option:
                current_summary["summary"] = f"Taking you to {matched_option}..."
                new_url = current_nav_options[matched_option]
                summarizer.link_history.append(new_url)
            else:
                current_summary["summary"] = (
                    "I'm not sure what you want to do. You can:\n"
                    f"1. Navigate to a section: {', '.join(current_nav_options.keys())}\n"
                    "2. Ask for specific information on this page"
                )

        # Add navigation options to summary if they exist
        if current_nav_options and "summary" in current_summary:
            if not current_summary["summary"].endswith("page"):  # Avoid duplicate navigation options
                current_summary["summary"] += f"\n\nAvailable sections: {', '.join(current_nav_options.keys())}"

        return current_summary, new_url

    except Exception as e:
        print(f"Error in agent_response: {e}")
        return {"summary": "Sorry, I encountered an error processing your request."}, None



async def find_website(prompt: str, summarizer: FastWebSummarizer) -> Tuple[Dict, Optional[str], bool]:
    """Find and summarize a website from a natural language prompt.
    Returns: (summary_dict, url, onStartup)
    - summary_dict: Contains the summary or error message
    - url: The found URL or None
    - onStartup: True if we need to keep searching, False if we found a valid site
    """
    try:
        # Use Gemini to find a relevant website with more specific examples
        url_prompt = f"""Given this user request: "{prompt}"

Find the most relevant and specific website URL that would help with this request. For example:
- "find me a site to buy shoes" -> "https://www.nike.com"
- "where can I find job listings" -> "https://www.linkedin.com/jobs"
- "show me a website for learning programming" -> "https://www.freecodecamp.org"
- "show me the uwaterloo website" -> "https://uwaterloo.ca"
- "show me the GenAI Genesis official site" -> "https://genaigenesis.ca"

Important rules:
1. Return ONLY the URL, nothing else
2. Just return the most specific and relevant URL (e.g., /jobs for job sites)
3. For universities, use the main domain
4. For hackathons/events, use the official event URL
5. If no relevant site can be determined, return "none"
6. Never return blocked or inaccessible sites
7. For shopping, prefer specialized retailers over general marketplaces

Return ONLY the URL, nothing else."""

        response = summarizer.model.generate_content(url_prompt)
        url = response.text.strip().strip('"').strip("'")
        
        # If no valid URL found, return error and True for onStartup
        if url.lower() == "none" or not is_url(url):
            return {
                "summary": "I couldn't find a relevant website for your request. Could you please try again with more specific details?"
            }, None, True
            
        # If we found a valid URL, try to summarize it
        try:
            # Use the existing quick_summarize method which is already working well
            summary, _ = await summarizer.quick_summarize(url)
            return summary, url, False
            
        except Exception as e:
            print(f"Error during summarization: {e}")  # Add logging for debugging
            return {
                "summary": f"I found a website but couldn't access it: {url}. Please try a different request."
            }, url, True
            
    except Exception as e:
        print(f"Error during URL resolution: {e}")  # Add logging for debugging
        return {
            "summary": "Sorry, I encountered an error while searching for a website. Please try again."
        }, None, True


async def test_combined_interaction():
    """Test find_website followed by agent_response interaction"""
    try:
        # Initialize summarizer
        summarizer = FastWebSummarizer()
        await summarizer.start_browser()
        
        # Test cases - each is a tuple of (initial prompt, list of follow-up messages)
        test_cases = [
            (
                "find me a site to learn programming",  # Initial prompt for find_website
                [  # Follow-up messages for agent_response
                    "what courses do you offer",
                    "tell me about the python course",
                    "what are the prerequisites",
                    "go back to main page"
                ]
            ),
            (
                "show me uwaterloo's website",  # Initial prompt for find_website
                [  # Follow-up messages for agent_response
                    "tell me about admissions",
                    "what programs are offered",
                    "tell me about computer science",
                    "go back"
                ]
            )
        ]
        
        print("\nTesting combined find_website and agent_response interaction...")
        
        for initial_prompt, follow_ups in test_cases:
            print(f"\n{'='*80}")
            print(f"Initial prompt: {initial_prompt}")
            print(f"{'='*80}")
            
            # First use find_website to get the URL
            summary, url, onStartup = await find_website(initial_prompt, summarizer)
            print(f"Found URL: {url}")
            print(f"Initial Summary: {summary['summary']}")
            print(f"OnStartup: {onStartup}")
            
            if not onStartup and url:  # If we found a valid site
                print("\nStarting interaction with the site...")
                
                # First send the URL to initialize the session
                summary, new_url = await agent_response(summarizer, url)
                print(f"\nInitial page loaded:")
                print(f"Summary: {summary['summary']}")
                
                # Then process follow-up messages
                for message in follow_ups:
                    print(f"\nUser message: {message}")
                    print("-" * 40)
                    summary, new_url = await agent_response(summarizer, message)
                    print(f"Summary: {summary['summary']}")
                    if new_url:
                        print(f"New URL: {new_url}")
            
            print(f"\n{'='*80}\n")
            
    except Exception as e:
        print(f"Error during test: {e}")
        traceback.print_exc()
    finally:
        if summarizer:
            await summarizer.close()

if __name__ == "__main__":
    print("Script started")
    asyncio.run(test_combined_interaction())