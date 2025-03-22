import torch
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import numpy as np

class VoiceProcessor:
    def __init__(self):
        # 初始化Whisper模型
        self.processor = WhisperProcessor.from_pretrained("openai/whisper-base")
        self.model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-base")
        
        if torch.cuda.is_available():
            self.model = self.model.to("cuda")
        
        self.sample_rate = 16000

    async def process_audio(self, audio_array: np.ndarray, sample_rate: int) -> str:
        try:
            # 重采样到16kHz（如果需要）
            if sample_rate != self.sample_rate:
                # 这里可以添加重采样逻辑
                pass
            
            # 将音频转换为特征
            input_features = self.processor(
                audio_array,
                sampling_rate=self.sample_rate,
                return_tensors="pt"
            ).input_features
            
            if torch.cuda.is_available():
                input_features = input_features.to("cuda")
            
            # 生成文本
            predicted_ids = self.model.generate(input_features)
            transcription = self.processor.batch_decode(
                predicted_ids,
                skip_special_tokens=True
            )[0]
            
            return transcription.strip().lower()
            
        except Exception as e:
            print(f"Error in voice processing: {str(e)}")
            return "" 