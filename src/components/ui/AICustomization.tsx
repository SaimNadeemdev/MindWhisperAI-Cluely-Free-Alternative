import React, { useState, useEffect } from 'react'
import { RiCloseLine as X, RiUser3Line as User, RiFileTextLine as FileText, RiSaveLine as Save } from 'react-icons/ri'
import { Button } from './button'
import { Input } from './input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './card'
import { Textarea } from './textarea'

interface AICustomizationProps {
  onClose: () => void
}

interface CustomizationData {
  cv: string
  customPrompt: string
}

const AICustomization: React.FC<AICustomizationProps> = ({ onClose }) => {
  const [cv, setCv] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Load existing customization data on mount
  useEffect(() => {
    const loadCustomization = async () => {
      try {
        const data = await window.electronAPI.getAICustomization()
        if (data) {
          setCv(data.cv || '')
          setCustomPrompt(data.customPrompt || '')
        }
      } catch (error) {
        console.error('Error loading AI customization:', error)
      }
    }
    loadCustomization()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    
    try {
      const data: CustomizationData = {
        cv: cv.trim(),
        customPrompt: customPrompt.trim()
      }
      
      await window.electronAPI.saveAICustomization(data)
      setSaveStatus('success')
      
      // Auto-hide success message after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error) {
      console.error('Error saving AI customization:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setCv('')
    setCustomPrompt('')
    setSaveStatus('idle')
  }

  return (
    <div 
      className="w-full rounded-2xl border border-white/20 backdrop-blur-xl shadow-xl animate-cmd-enter"
      style={{ backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
            <User className="w-4 h-4 text-black" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">AI Customization</h3>
            <p className="text-sm text-white/70">Personalize your AI assistant's responses</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-10 w-10 p-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 transition-all duration-200"
        >
          <X className="w-5 h-5 text-white" />
        </Button>
      </div>

      {/* Content */}
      <div className="px-6 pb-6 space-y-6">
        {/* CV Section */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-white" />
            <label className="text-sm font-medium text-white">Your CV/Resume</label>
          </div>
          <Textarea
            placeholder="Paste your CV or resume here. This helps the AI understand your background, skills, and experience to provide more relevant responses..."
            value={cv}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCv(e.target.value)}
            className="min-h-[120px] bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:bg-white/10 transition-all duration-200 resize-none"
            maxLength={5000}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-white/60">
              Include your skills, experience, education, and any relevant background
            </p>
            <span className="text-xs text-white/50">{cv.length}/5000</span>
          </div>
        </div>

        {/* Custom Prompt Section */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded bg-white/20 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">AI</span>
            </div>
            <label className="text-sm font-medium text-white">Custom Instructions (Optional)</label>
          </div>
          <Textarea
            placeholder="Add specific instructions for how the AI should respond. For example: 'Always provide code examples', 'Focus on practical solutions', 'Be concise and direct', etc..."
            value={customPrompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomPrompt(e.target.value)}
            className="min-h-[80px] bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-white/40 focus:bg-white/10 transition-all duration-200 resize-none"
            maxLength={1000}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-white/60">
              Specify tone, style, or specific requirements for AI responses
            </p>
            <span className="text-xs text-white/50">{customPrompt.length}/1000</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
            disabled={isSaving}
          >
            Reset
          </Button>
          
          <div className="flex items-center space-x-3">
            {/* Save Status Indicator */}
            {saveStatus === 'success' && (
              <div className="flex items-center space-x-2 text-emerald-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                <span>Saved successfully</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="flex items-center space-x-2 text-red-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <span>Save failed</span>
              </div>
            )}
            
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-white text-black hover:bg-gray-200 transition-all duration-200 font-medium px-6"
            >
              {isSaving ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </div>
              )}
            </Button>
          </div>
        </div>

        {/* Info Card */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h4 className="text-sm font-medium text-white mb-2">How this works</h4>
          <ul className="text-xs text-white/70 space-y-1">
            <li>• Your CV helps the AI understand your background and provide relevant advice</li>
            <li>• Custom instructions guide the AI's response style and focus areas</li>
            <li>• This context is added to all AI interactions (chat, live mode, screenshot analysis)</li>
            <li>• All data is stored locally and never shared externally</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default AICustomization
