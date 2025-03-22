#!/usr/bin/env python3

"""
Web Page Summarizer using Google's Gemini API
This script takes a URL as input and provides a concise summary of the webpage content.
"""

import os
import sys
import json
import asyncio
from typing import Dict, List, Optional
from dataclasses import dataclass
import argparse
from urllib.parse import urlparse

import google.generativeai as genai
from playwright.async_api import async_playwright
from rich.console import Console
from rich.panel import Panel
from rich import print as rprint

# Initialize rich console for better output
console = Console()

@dataclass
class WebPageContent:
    """Data class to store extracted webpage content"""
    title: str
    meta_description: Optional[str]
    headers: List[str]
    main_content: str
    url: str

class WebSummarizer:
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the summarizer with Gemini API key"""
        if api_key is None:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("Please provide a Google API key via GOOGLE_API_KEY environment variable")
        
        # Configure the Gemini API
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash')

    async def extract_content(self, url: str) -> WebPageContent:
        """Extract relevant content from the webpage"""
        async with async_playwright() as p:
            try:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                await page.goto(url, wait_until="networkidle")

                # Extract content
                title = await page.title()
                
                # Get meta description
                meta_desc_element = await page.query_selector('meta[name="description"]')
                meta_description = await meta_desc_element.get_attribute('content') if meta_desc_element else None

                # Get headers
                headers = []
                for header in await page.query_selector_all('h1, h2, h3'):
                    text = await header.text_content()
                    if text.strip():
                        headers.append(text.strip())

                # Get main content (paragraphs and lists)
                content_parts = []
                for element in await page.query_selector_all('article p, main p, .content p, #content p, p, article li, main li'):
                    text = await element.text_content()
                    if len(text.strip()) > 50:  # Only include substantial paragraphs
                        content_parts.append(text.strip())

                main_content = '\n\n'.join(content_parts)

                await browser.close()
                return WebPageContent(
                    title=title,
                    meta_description=meta_description,
                    headers=headers,
                    main_content=main_content,
                    url=url
                )
            except Exception as e:
                console.print(f"[red]Error extracting content from {url}: {str(e)}[/red]")
                raise

    def _build_prompt(self, content: WebPageContent) -> str:
        """Build the prompt for Gemini"""
        return f"""Analyze and summarize the following webpage content:

URL: {content.url}
Title: {content.title}
Description: {content.meta_description or 'N/A'}

Key Headers:
{chr(10).join(f'- {h}' for h in content.headers[:5])}

Main Content:
{content.main_content[:3000]}  # Limit content length

Please provide:
1. A concise 2-3 sentence summary of the main topic and key points
2. The primary purpose or goal of the webpage
3. Key takeaways (up to 3 bullet points)

Format the response as JSON with these fields:
{{
    "summary": "string",
    "purpose": "string",
    "key_takeaways": ["string"]
}}"""

    async def summarize(self, url: str) -> Dict:
        """Main method to summarize a webpage"""
        try:
            # Validate URL
            parsed_url = urlparse(url)
            if not all([parsed_url.scheme, parsed_url.netloc]):
                raise ValueError("Invalid URL provided")

            with console.status(f"[bold blue]Extracting content from {url}..."):
                content = await self.extract_content(url)

            with console.status("[bold blue]Generating summary with Gemini..."):
                prompt = self._build_prompt(content)
                response = self.model.generate_content(prompt)
                
                # Parse the JSON response
                try:
                    # Clean up the response text by removing markdown code block markers
                    clean_text = response.text.replace('```json', '').replace('```', '').strip()
                    result = json.loads(clean_text)
                    return result
                except json.JSONDecodeError as e:
                    console.print(f"[yellow]Warning: Could not parse JSON response: {e}[/yellow]")
                    # Fallback if response isn't proper JSON
                    return {
                        "summary": response.text,
                        "purpose": "Could not extract structured data",
                        "key_takeaways": []
                    }

        except Exception as e:
            console.print(f"[red]Error: {str(e)}[/red]")
            raise

def display_summary(summary: Dict):
    """Display the summary in a nice format"""
    rprint(Panel.fit(
        f"[bold blue]Summary:[/bold blue]\n{summary['summary']}\n\n"
        f"[bold blue]Purpose:[/bold blue]\n{summary['purpose']}\n\n"
        f"[bold blue]Key Takeaways:[/bold blue]\n" +
        "\n".join(f"• {point}" for point in summary['key_takeaways']),
        title="Webpage Summary",
        border_style="blue"
    ))

async def main():
    parser = argparse.ArgumentParser(description="Summarize webpage content using Gemini AI")
    parser.add_argument("url", help="URL of the webpage to summarize")
    parser.add_argument("--api-key", help="Google API Key (optional, can use GOOGLE_API_KEY env var)")
    args = parser.parse_args()

    try:
        summarizer = WebSummarizer(api_key=args.api_key)
        summary = await summarizer.summarize(args.url)
        display_summary(summary)
    except Exception as e:
        console.print(f"[red]Error: {str(e)}[/red]")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())