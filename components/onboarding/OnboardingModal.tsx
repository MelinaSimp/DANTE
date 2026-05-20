// components/onboarding/OnboardingModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
  action?: {
    text: string;
    onClick: () => void;
  };
}

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function OnboardingModal({ isOpen, onClose, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome to Drift AI Receptionist!",
      description: "Let's get you set up in just a few minutes.",
      content: (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <p className="text-gray-600">
            Your AI receptionist will answer calls, capture customer details, and schedule appointments automatically.
          </p>
        </div>
      )
    },
    {
      id: "contacts",
      title: "Manage Your Contacts",
      description: "Add and organize your customer information.",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">What you can do:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Add customer contact information</li>
              <li>• Edit and update contact details</li>
              <li>• Add notes about each customer</li>
              <li>• View all contacts in one place</li>
            </ul>
          </div>
          <p className="text-sm text-gray-600">
            Go to the <strong>Contacts</strong> page to add your first customer.
          </p>
        </div>
      ),
      action: {
        text: "Go to Contacts",
        onClick: () => {
          try {
            if (typeof window !== 'undefined' && window.location) {
              window.location.href = "/contacts";
            }
          } catch (error) {
            console.error('Error navigating:', error);
          }
          setCompletedSteps(prev => new Set([...prev, "contacts"]));
        }
      }
    },
    {
      id: "appointments",
      title: "Schedule Appointments",
      description: "Create and manage your appointment calendar.",
      content: (
        <div className="space-y-4">
          <div className="bg-green-50 rounded-lg p-4">
            <h4 className="font-semibold text-green-900 mb-2">Features include:</h4>
            <ul className="text-sm text-green-800 space-y-1">
              <li>• Create new appointments</li>
              <li>• View calendar and list views</li>
              <li>• Track appointment status</li>
              <li>• Link appointments to contacts</li>
            </ul>
          </div>
          <p className="text-sm text-gray-600">
            Visit the <strong>Appointments</strong> page to schedule your first appointment.
          </p>
        </div>
      ),
      action: {
        text: "Go to Appointments",
        onClick: () => {
          try {
            if (typeof window !== 'undefined' && window.location) {
              window.location.href = "/appointments";
            }
          } catch (error) {
            console.error('Error navigating:', error);
          }
          setCompletedSteps(prev => new Set([...prev, "appointments"]));
        }
      }
    },
    {
      id: "ai-setup",
      title: "Configure Your AI",
      description: "Set up your AI receptionist's knowledge base.",
      content: (
        <div className="space-y-4">
          <div className="bg-purple-50 rounded-lg p-4">
            <h4 className="font-semibold text-purple-900 mb-2">Add knowledge about:</h4>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>• Your services and pricing</li>
              <li>• Business hours and location</li>
              <li>• Common customer questions</li>
              <li>• Emergency procedures</li>
            </ul>
          </div>
          <p className="text-sm text-gray-600">
            Go to <strong>AI Setup</strong> to teach your AI receptionist about your business.
          </p>
        </div>
      ),
      action: {
        text: "Go to AI Setup",
        onClick: () => {
          try {
            if (typeof window !== 'undefined' && window.location) {
              window.location.href = "/settings/knowledge";
            }
          } catch (error) {
            console.error('Error navigating:', error);
          }
          setCompletedSteps(prev => new Set([...prev, "ai-setup"]));
        }
      }
    },
    {
      id: "complete",
      title: "You're All Set!",
      description: "Your AI receptionist is ready to help grow your business.",
      content: (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-600">
            You can always revisit this guide from the Settings page. Happy growing!
          </p>
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-floating border border-[#A67B5B]/20 animate-fade-up">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{currentStepData.title}</h2>
              <p className="text-sm text-gray-600 mt-1">{currentStepData.description}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(((currentStep + 1) / steps.length) * 100)}% complete</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Content */}
          <div className="mb-6">
            {currentStepData.content}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div>
              {!isFirstStep && (
                <Button
                  variant="ghost"
                  onClick={handlePrevious}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={handleSkip}
              >
                Skip Tour
              </Button>
              
              {currentStepData.action ? (
                <Button
                  onClick={currentStepData.action.onClick}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {currentStepData.action.text}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  {isLastStep ? "Finish" : "Next"}
                  {!isLastStep && <ChevronRight className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
