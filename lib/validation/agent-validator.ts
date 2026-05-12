// Validation utilities for agents, scenarios, and steps

export interface ValidationError {
  type: 'error' | 'warning';
  field: string;
  message: string;
  fixable: boolean;
  location?: string; // e.g., "scenario:123" or "step:456"
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Validate phone number format (E.164)
export function validatePhoneNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;
  // E.164 format: +[country code][number], max 15 digits after +
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone.trim());
}

// Validate agent configuration
export function validateAgent(agent: {
  id: string;
  name?: string | null;
  modality?: string | null;
  phone_number?: string | null;
  status?: string | null;
}, scenarios: any[], hasTwilioCredentials: boolean = false): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Required: Agent name
  if (!agent.name || agent.name.trim().length === 0) {
    errors.push({
      type: 'error',
      field: 'name',
      message: 'Agent name is required',
      fixable: true,
    });
  }

  // Required: Modality
  if (!agent.modality) {
    errors.push({
      type: 'error',
      field: 'modality',
      message: 'Agent modality (voice/chat/multi-modal) is required',
      fixable: true,
    });
  }

  // Required: Phone number for voice/multi-modal agents
  if (agent.modality === 'voice' || agent.modality === 'multi-modal') {
    if (!agent.phone_number) {
      errors.push({
        type: 'error',
        field: 'phone_number',
        message: 'Phone number is required for voice agents',
        fixable: true,
      });
    } else if (!validatePhoneNumber(agent.phone_number)) {
      errors.push({
        type: 'error',
        field: 'phone_number',
        message: 'Phone number must be in E.164 format (e.g., +1234567890)',
        fixable: true,
      });
    }

    // Warning: Twilio credentials not configured
    if (!hasTwilioCredentials) {
      warnings.push({
        type: 'warning',
        field: 'twilio_credentials',
        message: 'Twilio credentials not configured. Voice calls will not work.',
        fixable: true,
      });
    }
  }

  // Required: At least one scenario
  if (!scenarios || scenarios.length === 0) {
    errors.push({
      type: 'error',
      field: 'scenarios',
      message: 'Agent must have at least one scenario',
      fixable: true,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validate scenario
export function validateScenario(scenario: {
  id: string;
  name?: string | null;
  steps?: any[];
}, agentId: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Required: Scenario name
  if (!scenario.name || scenario.name.trim().length === 0) {
    errors.push({
      type: 'error',
      field: 'name',
      message: 'Scenario name is required',
      fixable: true,
      location: `scenario:${scenario.id}`,
    });
  }

  // Required: At least one step
  if (!scenario.steps || scenario.steps.length === 0) {
    errors.push({
      type: 'error',
      field: 'steps',
      message: 'Scenario must have at least one step',
      fixable: true,
      location: `scenario:${scenario.id}`,
    });
  } else {
    // Check for greeting step (first step should be Say or Gather)
    const firstStep = scenario.steps[0];
    if (firstStep.type !== 'say' && firstStep.type !== 'gather') {
      warnings.push({
        type: 'warning',
        field: 'greeting',
        message: 'First step should be a "Say" or "Gather" step to greet the user',
        fixable: true,
        location: `scenario:${scenario.id}`,
      });
    }

    // Validate each step
    scenario.steps.forEach((step, index) => {
      const stepErrors = validateStep(step, scenario.id);
      errors.push(...stepErrors.errors);
      warnings.push(...stepErrors.warnings);
    });

    // Check for branch validity
    (scenario.steps ?? []).forEach((step) => {
      if (step.branches && step.branches.length > 0) {
        step.branches.forEach((branch: any) => {
          // Check if branch target exists
          if (branch.next_step_id) {
            const targetStep = (scenario.steps ?? []).find((s: any) => s.id === branch.next_step_id);
            if (!targetStep) {
              errors.push({
                type: 'error',
                field: 'branch_target',
                message: `Branch targets non-existent step: ${branch.next_step_id}`,
                fixable: true,
                location: `scenario:${scenario.id}:step:${step.id}`,
              });
            }
          }
          // Check if branch has condition
          if (!branch.condition || branch.condition.trim().length === 0) {
            warnings.push({
              type: 'warning',
              field: 'branch_condition',
              message: 'Branch has no condition specified',
              fixable: true,
              location: `scenario:${scenario.id}:step:${step.id}`,
            });
          }
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validate step
export function validateStep(step: {
  id: string;
  type: string;
  ai_message?: string | null;
  name?: string | null;
  branches?: any[];
  [key: string]: any;
}, scenarioId: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Required: Step type
  if (!step.type) {
    errors.push({
      type: 'error',
      field: 'type',
      message: 'Step type is required',
      fixable: true,
      location: `scenario:${scenarioId}:step:${step.id}`,
    });
  }

  // Type-specific validation
  switch (step.type) {
    case 'say':
      if (!step.ai_message || step.ai_message.trim().length === 0) {
        errors.push({
          type: 'error',
          field: 'ai_message',
          message: 'Say step must have a message',
          fixable: true,
          location: `scenario:${scenarioId}:step:${step.id}`,
        });
      }
      break;

    case 'gather':
      if (!step.name || step.name.trim().length === 0) {
        errors.push({
          type: 'error',
          field: 'name',
          message: 'Gather step must have a variable name',
          fixable: true,
          location: `scenario:${scenarioId}:step:${step.id}`,
        });
      }
      if (!step.ai_message || step.ai_message.trim().length === 0) {
        warnings.push({
          type: 'warning',
          field: 'ai_message',
          message: 'Gather step should have a prompt message',
          fixable: true,
          location: `scenario:${scenarioId}:step:${step.id}`,
        });
      }
      break;

    case 'send_sms':
      if (!step.sms_config) {
        errors.push({
          type: 'error',
          field: 'sms_config',
          message: 'Send SMS step must have SMS configuration',
          fixable: true,
          location: `scenario:${scenarioId}:step:${step.id}`,
        });
      } else {
        if (!step.sms_config.message || step.sms_config.message.trim().length === 0) {
          errors.push({
            type: 'error',
            field: 'sms_config.message',
            message: 'Send SMS step must have a message',
            fixable: true,
            location: `scenario:${scenarioId}:step:${step.id}`,
          });
        }
        if (!step.sms_config.phone_number || step.sms_config.phone_number.trim().length === 0) {
          errors.push({
            type: 'error',
            field: 'sms_config.phone_number',
            message: 'Send SMS step must have a phone number',
            fixable: true,
            location: `scenario:${scenarioId}:step:${step.id}`,
          });
        }
      }
      break;

    case 'schedule':
      // Schedule step doesn't require explicit configuration
      // It extracts appointment info from conversation automatically
      // Optional: Check if step has a confirmation message
      if (!step.ai_message || step.ai_message.trim().length === 0) {
        warnings.push({
          type: 'warning',
          field: 'ai_message',
          message: 'Schedule step should have a confirmation message',
          fixable: true,
          location: `scenario:${scenarioId}:step:${step.id}`,
        });
      }
      break;

    case 'transfer':
      if (!step.transfer_config) {
        errors.push({
          type: 'error',
          field: 'transfer_config',
          message: 'Transfer step must have transfer configuration',
          fixable: true,
          location: `scenario:${scenarioId}:step:${step.id}`,
        });
      } else if (!step.transfer_config.phone_number) {
        errors.push({
          type: 'error',
          field: 'transfer_config.phone_number',
          message: 'Transfer step must have a phone number',
          fixable: true,
          location: `scenario:${scenarioId}:step:${step.id}`,
        });
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validate all scenarios for an agent
export function validateAllScenarios(scenarios: any[]): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  scenarios.forEach((scenario) => {
    const result = validateScenario(scenario, '');
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// Get validation summary text
export function getValidationSummary(result: ValidationResult): string {
  if (result.isValid && result.warnings.length === 0) {
    return 'All validations passed';
  }
  
  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;
  
  if (errorCount > 0 && warningCount > 0) {
    return `${errorCount} error${errorCount !== 1 ? 's' : ''} and ${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
  } else if (errorCount > 0) {
    return `${errorCount} error${errorCount !== 1 ? 's' : ''} found`;
  } else {
    return `${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
  }
}

