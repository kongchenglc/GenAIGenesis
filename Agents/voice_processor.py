import torch
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import numpy as np

class VoiceProcessor:
    def __init__(self):
        # Initialize Whisper model
        self.processor = WhisperProcessor.from_pretrained("openai/whisper-base")
        self.model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-base")
        
        if torch.cuda.is_available():
            self.model = self.model.to("cuda")
        
        self.sample_rate = 16000

    async def process_audio(self, audio_array: np.ndarray, sample_rate: int) -> str:
        try:
            # Resample to 16kHz (if needed)
            if sample_rate != self.sample_rate:
                # Resampling logic can be added here
                pass
            
            # Convert audio to features
            input_features = self.processor(
                audio_array,
                sampling_rate=self.sample_rate,
                return_tensors="pt"
            ).input_features
            
            if torch.cuda.is_available():
                input_features = input_features.to("cuda")
            
            # Generate text with English language forced
            predicted_ids = self.model.generate(
                input_features,
                language="en",  # Force English language
                task="transcribe"  # Transcription task
            )
            
            transcription = self.processor.batch_decode(
                predicted_ids,
                skip_special_tokens=True
            )[0]
            
            return transcription.strip().lower()
            
        except Exception as e:
            print(f"Error in voice processing: {str(e)}")
            return "" 