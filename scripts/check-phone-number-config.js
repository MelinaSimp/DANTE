const vapiApiKey = '2bf8f671-ccbb-440b-bf7e-9d5985ad3152';
const assistantId = '8b192691-bcec-4f2c-b1e1-7d8a3133411f';
const phoneNumber = '+12163508215';

async function checkPhoneNumber() {
  console.log('🔍 Checking Vapi Phone Number Configuration...\n');
  console.log('Phone Number:', phoneNumber);
  console.log('Assistant ID:', assistantId);
  console.log('');

  try {
    // Get all phone numbers
    const response = await fetch('https://api.vapi.ai/phone-number', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to fetch phone numbers:', errorText);
      return;
    }

    const phoneNumbers = await response.json();
    const phoneNumberList = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];
    
    // Find the phone number we're looking for
    const targetPhone = phoneNumberList.find(pn => 
      pn.number === phoneNumber || 
      pn.number === phoneNumber.replace(/[^0-9+]/g, '') ||
      pn.assistantId === assistantId
    );

    if (!targetPhone) {
      console.log('❌ Phone number not found');
      console.log('\nAvailable phone numbers:');
      phoneNumberList.forEach(pn => {
        console.log(`  - ${pn.number} (ID: ${pn.id}, Assistant: ${pn.assistantId || 'none'})`);
      });
      return;
    }

    console.log('📋 Phone Number Configuration:');
    console.log('  ID:', targetPhone.id);
    console.log('  Number:', targetPhone.number);
    console.log('  Assistant ID:', targetPhone.assistantId || 'NOT LINKED ❌');
    console.log('  Server URL:', targetPhone.server?.url || 'NOT SET ❌');
    console.log('  Server Timeout:', targetPhone.server?.timeoutSeconds || 'NOT SET');
    console.log('  Status:', targetPhone.status || 'unknown');
    console.log('');

    // Verify assistant matches
    if (targetPhone.assistantId !== assistantId) {
      console.log('❌ ISSUE: Phone number is linked to a DIFFERENT assistant!');
      console.log('   Expected:', assistantId);
      console.log('   Actual:', targetPhone.assistantId);
      console.log('');
    }

    // Verify server URL
    const expectedServerUrl = 'https://driftai.studio/api/vapi/webhook';
    if (targetPhone.server?.url !== expectedServerUrl) {
      console.log('❌ ISSUE: Phone number Server URL does NOT match assistant Server URL!');
      console.log('   Expected:', expectedServerUrl);
      console.log('   Actual:', targetPhone.server?.url || 'NOT SET');
      console.log('');
      console.log('🔧 This is the problem! Phone number Server URL overrides assistant Server URL!');
      console.log('   When a phone number has its own Server URL, Vapi uses THAT instead of the assistant\'s.');
      console.log('');
    } else {
      console.log('✅ Phone number Server URL matches assistant Server URL');
    }

    // Check if assistant and phone number both have correct server URL
    const assistantResponse = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (assistantResponse.ok) {
      const assistant = await assistantResponse.json();
      console.log('\n📋 Assistant Configuration:');
      console.log('  Server URL:', assistant.serverUrl || 'NOT SET ❌');
      console.log('  First Message:', assistant.firstMessage || '(empty ✅)');
      console.log('  First Message Mode:', assistant.firstMessageMode || 'NOT SET ❌');
      console.log('');

      if (assistant.serverUrl === expectedServerUrl && targetPhone.server?.url === expectedServerUrl) {
        console.log('✅ Both assistant and phone number have correct Server URL');
        console.log('');
        console.log('⚠️  But Vapi is still not sending request-start events!');
        console.log('   This might be a Vapi bug or caching issue.');
        console.log('');
        console.log('🔧 Try this:');
        console.log('   1. Unlink the phone number from the assistant');
        console.log('   2. Relink it');
        console.log('   3. Or update the phone number Server URL again (might clear cache)');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkPhoneNumber();
