-- Drop the legacy TwiML IVR tables. The state machine that populated
-- them (greeting → questions → farewell) was removed when VAPI took
-- over inbound voice. `receptionist_call_logs` is kept because it
-- still stores call audits written by the evaluations pipeline.

DROP TABLE IF EXISTS receptionist_call_status_events CASCADE;
DROP TABLE IF EXISTS receptionist_sessions CASCADE;
DROP TABLE IF EXISTS receptionist_questions CASCADE;
DROP TABLE IF EXISTS receptionist_settings CASCADE;
