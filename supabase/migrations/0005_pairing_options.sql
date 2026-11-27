-- Power-matching options chosen by the organizer.
alter table tournaments
  add column power_style text not null default 'high_high' check (power_style in ('high_high', 'high_low', 'slide')),
  add column bracketed boolean not null default false,
  add column avoid_same_school boolean not null default true;

-- side_constraint and pairing_method were free text; hold them to the values the app understands.
update tournaments set side_constraint = 'alternate' where side_constraint not in ('alternate', 'flip_even', 'balanced', 'none');
update tournaments set pairing_method = 'power' where pairing_method not in ('power', 'random');
alter table tournaments
  add constraint side_constraint_known check (side_constraint in ('alternate', 'flip_even', 'balanced', 'none')),
  add constraint pairing_method_known check (pairing_method in ('power', 'random'));
