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

import google.generativeai as genai
from playwright.async_api import async_playwright
from rich.console import Console

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
        self.model = genai.GenerativeModel('gemini-2.0-flash')
        self.browser = None
        self.current_page = None

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
        print("I can take you to any of these sections:")
        print(", ".join(nav_options.keys()))
    
    print("\nJust tell me where you'd like to go!")
    return nav_options

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

def agent_response(summary: Dict, nav_options):
    text_response = summary['summary'] 

    if nav_options:
        text_response += f"\nI can take you to any of these sections: {', '.join(nav_options.keys())}."

    else:
        text_response += "\nJust tell me where you'd like to go!"
    
    return text_response, nav_options




def _match_user_intent(user_input: str, available_options: Dict[str, str], model) -> Optional[str]:
    """Use LLM to match user input to available navigation options"""
    # First check if user wants to exit
    if any(word in user_input.lower() for word in ['quit', 'exit', 'bye', 'goodbye', 'q', 'stop', 'end']):
        return 'EXIT'
        
    prompt = f"""Given these available navigation options: {list(available_options.keys())}

User said: "{user_input}"

Which option (if any) are they most likely trying to navigate to? Return EXACTLY one of the available options if there's a match, or "none" if no good match.
Only return the matching text or "none", nothing else."""

    try:
        response = model.generate_content(prompt)
        match = response.text.strip().strip('"').strip("'")
        return match if match in available_options else None
    except Exception:
        return None

async def temp(summarizer: FastWebSummarizer, initial_url: str):
    
    current_url = initial_url

    summary, links = await summarizer.quick_summarize(current_url)
    
    try:
        while True:
            try:
                summary, links = await summarizer.quick_summarize(current_url)
                nav_options = display_quick_summary(summary, links)
                
                if not nav_options:
                    print("\nLooks like we've reached a page without any navigation options.")
                    break
                    
                user_input = input().strip()
                matched_option = _match_user_intent(user_input, nav_options, summarizer.model)
                
                if matched_option == 'EXIT':
                    print("\nAlright, hope that was helpful!")
                    break
                elif matched_option:
                    print(f"\nTaking you to {matched_option}...")
                    current_url = nav_options[matched_option]
                else:
                    print("\nI'm not sure where you want to go. Could you try saying it differently?")
                    print("You can go to any of these sections:", ", ".join(nav_options.keys()))
                    
            except KeyboardInterrupt:
                print("\n\nGot it, stopping now!")
                break
            except Exception as e:
                print(f"\nOops, something went wrong: {str(e)}")
                print("Let's try something else.")
                break
    finally:
        # Always ensure we clean up
        await summarizer.close()

async def main():
    parser = argparse.ArgumentParser(description="Fast webpage summarizer for accessibility")
    parser.add_argument("url", help="URL of the webpage to summarize")
    parser.add_argument("--api-key", help="Google API Key (optional, can use GOOGLE_API_KEY env var)")
    args = parser.parse_args()

    summarizer = None
    try:
        summarizer = FastWebSummarizer(api_key=args.api_key)
        summary, links = await summarizer.quick_summarize(args.url)
        nav_options = generate_nav_options(links)
        text_response, nav_options = agent_response(summary, nav_options)
    except KeyboardInterrupt:
        print("\n\nGot it, stopping now!")
    except Exception as e:
        print(f"\nError: {str(e)}")
        sys.exit(1)
    finally:
        if summarizer:
            await summarizer.close()

if __name__ == "__main__":
    asyncio.run(main())
