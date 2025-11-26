import React, { useState, useEffect } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './card';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Badge } from './badge';
import { Separator } from './separator';

interface ModelConfig {
  provider: "ollama" | "gemini";
  model: string;
  isOllama: boolean;
}

interface ModelSelectorProps {
  onModelChange?: (provider: "ollama" | "gemini", model: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange }) => {
  const [currentConfig, setCurrentConfig] = useState<ModelConfig | null>(null);
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'testing' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<"ollama" | "gemini">("gemini");
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>("");
  const [ollamaUrl, setOllamaUrl] = useState<string>("http://localhost:11434");

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      setIsLoading(true);
      const config = await window.electronAPI.getCurrentLlmConfig();
      setCurrentConfig(config);
      setSelectedProvider(config.provider);
      
      if (config.isOllama) {
        setSelectedOllamaModel(config.model);
        await loadOllamaModels();
      }
    } catch (error) {
      console.error('Error loading current config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const models = await window.electronAPI.getAvailableOllamaModels();
      setAvailableOllamaModels(models);
      
      // Auto-select first model if none selected
      if (models.length > 0 && !selectedOllamaModel) {
        setSelectedOllamaModel(models[0]);
      }
    } catch (error) {
      console.error('Error loading Ollama models:', error);
      setAvailableOllamaModels([]);
    }
  };

  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      const result = await window.electronAPI.testLlmConnection();
      setConnectionStatus(result.success ? 'success' : 'error');
      if (!result.success) {
        setErrorMessage(result.error || 'Unknown error');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(String(error));
    }
  };

  const handleProviderSwitch = async () => {
    try {
      setConnectionStatus('testing');
      let result;
      
      if (selectedProvider === 'ollama') {
        result = await window.electronAPI.switchToOllama(selectedOllamaModel, ollamaUrl);
      } else {
        result = await window.electronAPI.switchToGemini(geminiApiKey || undefined);
      }

      if (result.success) {
        await loadCurrentConfig();
        setConnectionStatus('success');
        onModelChange?.(selectedProvider, selectedProvider === 'ollama' ? selectedOllamaModel : 'MindWhisper AI');
      } else {
        setConnectionStatus('error');
        setErrorMessage(result.error || 'Switch failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(String(error));
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'testing': return 'text-gray-700';
      case 'success': return 'text-black';
      case 'error': return 'text-black';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'testing': return 'Testing connection...';
      case 'success': return 'Connected successfully';
      case 'error': return `Error: ${errorMessage}`;
      default: return 'Ready';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-secondary/30 rounded-lg border border-border">
        <div className="animate-pulse text-sm text-muted-foreground">Loading model configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-cmd-enter">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-foreground animate-pulse"></div>
          <span className="text-sm font-semibold text-foreground">AI Provider</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {getStatusText()}
        </div>
      </div>

      {/* Current Model Display */}
      {currentConfig && (
        <Card className="card-premium">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20">
                  <span className="text-primary text-sm font-semibold">
                    {currentConfig.provider === 'ollama' ? '⚡' : '☁'}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      {currentConfig.provider === 'ollama' ? 'Local' : 'Cloud'}
                    </h4>
                    <Badge variant="success" className="text-[10px] px-1.5 py-0.5">
                      Active
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-[180px] mt-0.5">
                    {currentConfig.provider === 'gemini' ? 'MindWhisper AI' : currentConfig.model}
                  </p>
                </div>
              </div>
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-foreground">AI Provider</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => setSelectedProvider('gemini')}
            variant={selectedProvider === 'gemini' ? 'default' : 'outline'}
            className="h-12 rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-stealth-md group"
          >
            <div className="flex flex-col items-center space-y-1">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center border border-blue-500/20 group-hover:border-blue-500/40 transition-colors">
                <span className="text-blue-500 text-sm">☁</span>
              </div>
              <span className="text-xs font-medium">MindWhisper AI</span>
            </div>
          </Button>
          <Button
            onClick={() => setSelectedProvider('ollama')}
            variant={selectedProvider === 'ollama' ? 'default' : 'outline'}
            className="h-12 rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-stealth-md group"
          >
            <div className="flex flex-col items-center space-y-1">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20 group-hover:border-amber-500/40 transition-colors">
                <span className="text-amber-500 text-sm">⚡</span>
              </div>
              <span className="text-xs font-medium">Ollama</span>
            </div>
          </Button>
        </div>
      </div>

      <Separator className="my-4" />
      
      {/* Provider-specific Configuration */}
      <Card className="card-premium">
        <CardContent className="p-4 space-y-4">
        {selectedProvider === 'gemini' ? (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-sm bg-primary flex items-center justify-center">
                <svg className="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2m-2-2a2 2 0 00-2 2m2-2V5a2 2 0 00-2-2" />
                </svg>
              </div>
              <h5 className="text-xs font-semibold text-foreground">MindWhisper AI</h5>
            </div>
            <div className="text-[11px] text-muted-foreground">No API setup required.</div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-sm bg-primary flex items-center justify-center">
                <svg className="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                </svg>
              </div>
              <h5 className="text-xs font-semibold text-foreground">Local Configuration</h5>
            </div>
            
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1">Server URL</label>
              <Input
                type="url"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="w-full h-8 text-xs"
                placeholder="http://localhost:11434"
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-foreground">Models</label>
                <Button
                  onClick={loadOllamaModels}
                  variant="outline"
                  size="sm"
                  className="px-2 py-0.5 text-[11px] h-6 hover:-translate-y-0.5 transition-all"
                  title="Refresh model list"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </Button>
              </div>
              
              {availableOllamaModels.length > 0 ? (
                <Select value={selectedOllamaModel} onValueChange={setSelectedOllamaModel}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOllamaModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                          <span>{model}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="card-premium p-2 flex items-center space-x-2">
                  <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-[11px] font-medium text-foreground">No models found</p>
                    <p className="text-[11px] text-muted-foreground">Ensure Ollama is running</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={handleProviderSwitch}
          disabled={connectionStatus === 'testing'}
          className="flex-1 h-10 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 hover:-translate-y-0.5 transition-all duration-200"
        >
          {connectionStatus === 'testing' ? (
            <>
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>Applying...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Apply Changes</span>
            </>
          )}
        </Button>
        
        <Button
          onClick={testConnection}
          disabled={connectionStatus === 'testing'}
          variant="outline"
          className="px-4 h-10 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 hover:-translate-y-0.5 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span>Test</span>
        </Button>
      </div>

      <Separator className="my-4" />
      
      {/* Information (collapsed by default to save space) */}
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-3 p-3 rounded-xl hover:bg-stealth-card/30 transition-all duration-200">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <span className="text-primary text-sm">i</span>
          </div>
          <span className="text-sm font-semibold text-foreground">Provider Comparison</span>
          <svg className="w-4 h-4 ml-auto text-muted-foreground transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="mt-3 p-3 space-y-3 bg-stealth-card/20 rounded-xl border border-stealth-border/50">
          <div className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2">
              <span className="text-blue-500">☁</span>
              <span className="font-medium text-foreground text-sm">MindWhisper AI</span>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">Fast</Badge>
              <Badge variant="outline" className="text-xs">Cloud</Badge>
            </div>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2">
              <span className="text-amber-500">⚡</span>
              <span className="font-medium text-foreground text-sm">Ollama</span>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">Private</Badge>
              <Badge variant="outline" className="text-xs">Local</Badge>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
};

export default ModelSelector;