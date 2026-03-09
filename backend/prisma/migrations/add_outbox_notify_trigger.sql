-- LISTEN/NOTIFY trigger for faster outbox processing
-- The outbox consumer listens for 'outbox_events' notifications
-- to reduce polling latency from 1s to near-instant

CREATE OR REPLACE FUNCTION notify_outbox_event() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_events', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_event_notify
  AFTER INSERT ON "OutboxEvent"
  FOR EACH ROW EXECUTE FUNCTION notify_outbox_event();
