process.env.IS_AGENT_TEST = 'true';
import dotenv from 'dotenv';
dotenv.config();

async function executeTest() {
  console.log('--- STARTING AGENT ORCHESTRATION TEST ---');
  
  // Dynamically import SupervisorAgent after setting env variable
  const { SupervisorAgent } = await import('../src/backend/agents/SupervisorAgent.js');
  
  const mockInputs = {
    userId: 'guest',
    symptoms: 'A motorbike accident victim with visible leg deformity and active severe bleeding.',
    lat: 26.8467,
    lng: 80.9462,
    imageBase64: 'mock_base64_image_data_here'
  };

  try {
    const finalState = await SupervisorAgent.runEmergencyWorkflow(mockInputs);
    
    console.log('\n--- GRAPH WORKFLOW EXECUTED ---');
    console.log('Errors:', finalState.errors);
    console.log('Vision:', finalState.vision);
    console.log('Report:', finalState.report);
    console.log('Location:', finalState.location);
    console.log('Vault:', finalState.vault);
    console.log('Hospitals:', finalState.hospitals);
    console.log('Doctor:', finalState.doctor);
    console.log('Ambulance:', finalState.ambulance);
    console.log('SOS:', finalState.sos);
    console.log('Dispatch:', finalState.dispatch);
    console.log('Communication:', finalState.communication);
    
    console.log('\n--- TEST EXECUTION COMPLETE ---');
  } catch (error) {
    console.error('Test script crashed:', error);
  }
}

executeTest();
