-- Seed abstract_lease skill into all real_estate workspaces.
--
-- Lease abstraction is the core CRE workflow: upload a lease PDF,
-- ask Vergil to abstract it, get a structured output with every
-- key term cited back to the vault document. The skill uses
-- vault.cite + archive.search to pull sections and outputs a
-- markdown abstract covering parties, premises, term, rent,
-- CAM, security, TI, use restrictions, transfer rights,
-- termination, options, insurance, and default provisions.
--
-- max_steps = 20 because a thorough abstract requires 12-15
-- targeted vault.cite queries across different lease sections.

insert into dante_skills (workspace_id, name, version, description, config, input_schema, auto_approve)
select
  w.id,
  'abstract_lease',
  1,
  'Extract key terms from a commercial lease into a structured abstract with vault citations.',
  jsonb_build_object(
    'objective', 'Abstract the lease for {{input.property_name}}. Search the vault for the lease document, then run targeted vault.cite queries to extract every standard CRE lease field: parties, premises, term, rent schedule, escalations, CAM/operating expenses, security deposit, TI allowance, permitted use, exclusivity, assignment/subletting, termination provisions, renewal/expansion options, insurance requirements, default/remedies, parking, and signage. Present each field with its vault citation inline. Flag any standard fields not found in the document. Output as structured markdown matching the lease abstract format. {{#if input.notes}}Additional context: {{input.notes}}{{/if}}',
    'system', 'You are abstracting a commercial lease on behalf of a CRE broker. Accuracy is paramount — every number, date, and name must carry a vault citation. Do not invent terms. If a field is not in the document, say ''Not found in document.'' Output structured markdown, not prose. Run as many vault.cite passes as needed — a partial abstract is unacceptable.',
    'tools', jsonb_build_array('vault.cite', 'archive.search'),
    'max_steps', 20
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('property_name'),
    'properties', jsonb_build_object(
      'property_name', jsonb_build_object('type', 'string'),
      'notes', jsonb_build_object('type', 'string')
    )
  ),
  true                                                   -- read-only; safe to auto-run
from workspaces w
where w.industry = 'real_estate'
on conflict (workspace_id, name, version) do nothing;
