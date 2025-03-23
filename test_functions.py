
async def test_find_website():
    """Test the find_website function"""
    try:
        # Initialize summarizer
        summarizer = FastWebSummarizer()
        await summarizer.start_browser()
        
        # Test cases
        test_prompts = [
            "find me a site to buy shoes",
            "where can I find job listings",
            "show me a website for learning programming",
            "show me the uwaterloo website",
            "show me the GenAI Genesis Hackathon official site"
        ]
        
        print("\nTesting find_website function...")
        for prompt in test_prompts:
            print(f"\nPrompt: {prompt}")
            print("="*80)
            summary, url, onStartup = await find_website(prompt, summarizer)
            print(f"Summary: {summary['summary']}")
            print(f"URL: {url}")
            print(f"OnStartup: {onStartup}")
            print("="*80)
            
    except Exception as e:
        print(f"Error during test: {e}")
        traceback.print_exc()
    finally:
        if summarizer:
            await summarizer.close()