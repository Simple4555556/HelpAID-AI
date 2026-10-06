import { AgentState, createInitialState } from './AgentState';
import { StateGraph } from './StateGraph';
import { VisionAgent } from './VisionAgent';
import { ReportAgent } from './ReportAgent';
import { LocationAgent } from './LocationAgent';
import { MedicalVaultAgent } from './MedicalVaultAgent';
import { HospitalFinderAgent } from './HospitalFinderAgent';
import { DoctorMatchingAgent } from './DoctorMatchingAgent';
import { AmbulanceAgent } from './AmbulanceAgent';
import { SosAgent } from './SosAgent';
import { DispatchAgent } from './DispatchAgent';
import { CommunicationAgent } from './CommunicationAgent';

export class SupervisorAgent {
  static buildGraph(): StateGraph {
    const graph = new StateGraph();

    // 1. Add all agent nodes to the graph topology
    graph.addNode('vision', VisionAgent);
    graph.addNode('location', LocationAgent);
    graph.addNode('vault', MedicalVaultAgent);
    graph.addNode('report', ReportAgent);
    graph.addNode('hospitals', HospitalFinderAgent);
    graph.addNode('doctor', DoctorMatchingAgent);
    graph.addNode('ambulance', AmbulanceAgent);
    graph.addNode('sos', SosAgent);
    graph.addNode('dispatch', DispatchAgent);
    graph.addNode('communication', CommunicationAgent);

    // 2. Add orchestration edges (dependencies)
    // Vision, Location, and Vault run in parallel first
    graph.addEdge('vision', 'report');
    graph.addEdge('location', 'report');
    graph.addEdge('vault', 'report');

    // Hospitals, Doctor matching, and Ambulance routing depend on the triage report
    graph.addEdge('report', 'hospitals');
    graph.addEdge('report', 'doctor');
    graph.addEdge('report', 'ambulance');

    // SOS alert compilation waits for Hospitals, Doctor, and Ambulance matching to complete
    graph.addEdge('hospitals', 'sos');
    graph.addEdge('doctor', 'sos');
    graph.addEdge('ambulance', 'sos');

    // Database logging and locking depends on compiled SOS payload
    graph.addEdge('sos', 'dispatch');

    // WebSocket broadcaster and final notification triggers run last
    graph.addEdge('dispatch', 'communication');

    return graph;
  }

  static async runEmergencyWorkflow(inputs: AgentState['inputs']): Promise<AgentState> {
    console.log(`[SupervisorAgent] Triggering Multi-Agent StateGraph Workflow for user: ${inputs.userId || 'guest'}`);
    const graph = this.buildGraph();
    const initialState = createInitialState(inputs);
    
    try {
      const finalState = await graph.run(initialState);
      console.log(`[SupervisorAgent] Workflow execution complete. Status: ${finalState.errors.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS'}`);
      return finalState;
    } catch (error: any) {
      console.error('[SupervisorAgent] Core StateGraph Orchestration failed:', error);
      initialState.errors.push(`Supervisor: Graph runtime error: ${error?.message || error}`);
      return initialState;
    }
  }
}
