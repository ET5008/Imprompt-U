// Voice input hook — stubbed until voice feature is enabled.
// isSupported is always false so the mic button renders in disabled/coming-soon state.
// To enable: set isSupported check to real SpeechRecognition detection and
// implement startListening / stopListening with the Web Speech API.

export interface UseVoiceInputReturn {
  isSupported: boolean;
  isListening: boolean;
  startListening: (onTranscript: (text: string) => void) => void;
  stopListening: () => void;
}

export function useVoiceInput(): UseVoiceInputReturn {
  return {
    isSupported: false,
    isListening: false,
    startListening: (_onTranscript) => {
      // TODO: implement Web Speech API
    },
    stopListening: () => {
      // TODO: implement Web Speech API
    },
  };
}
