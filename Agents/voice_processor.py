import torch
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import numpy as np

class VoiceProcessor:
    def __init__(self, model_name="openai/whisper-base", sample_rate=16000):
        # Initialize Whisper model with configurable model name
        self.processor = WhisperProcessor.from_pretrained(model_name)
        self.model = WhisperForConditionalGeneration.from_pretrained(model_name)
        
        if torch.cuda.is_available():
            self.model = self.model.to("cuda")
        
        self.sample_rate = sample_rate

    async def process_audio(self, audio_array: np.ndarray, sample_rate: int) -> str:
        """Process audio data and convert to text"""
        try:
            # Resample if needed (placeholder for actual resampling logic)
            if sample_rate != self.sample_rate:
                # Resampling logic would go here
                pass
            
            # Convert audio to features
            input_features = self.processor(
                audio_array,
                sampling_rate=self.sample_rate,
                return_tensors="pt"
            ).input_features
            
            if torch.cuda.is_available():
                input_features = input_features.to("cuda")
            
            # Generate text
            predicted_ids = self.model.generate(
                input_features,
                language="en",
                task="transcribe"
            )
            
            transcription = self.processor.batch_decode(
                predicted_ids,
                skip_special_tokens=True
            )[0]
            
            return transcription.strip().lower()
            
        except Exception as e:
            print(f"Error in voice processing: {str(e)}")
            return "" 