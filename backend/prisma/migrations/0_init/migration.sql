--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: AdapterDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdapterDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND'
);


--
-- Name: AdapterType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdapterType" AS ENUM (
    'LIVE_SCORE',
    'OOP',
    'LIVE_TIMING',
    'AS_RUN',
    'EPG',
    'PLAYOUT',
    'NOTIFICATION'
);


--
-- Name: AnchorType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AnchorType" AS ENUM (
    'FIXED_TIME',
    'COURT_POSITION',
    'FOLLOWS_MATCH',
    'HANDOFF',
    'NOT_BEFORE'
);


--
-- Name: BroadcastSlotStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BroadcastSlotStatus" AS ENUM (
    'PLANNED',
    'LIVE',
    'OVERRUN',
    'SWITCHED_OUT',
    'COMPLETED',
    'VOIDED'
);


--
-- Name: ContentSegment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContentSegment" AS ENUM (
    'FULL',
    'CONTINUATION'
);


--
-- Name: ContractStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContractStatus" AS ENUM (
    'valid',
    'expiring',
    'draft',
    'none'
);


--
-- Name: CoverageType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CoverageType" AS ENUM (
    'LIVE',
    'HIGHLIGHTS',
    'DELAYED',
    'CLIP'
);


--
-- Name: DraftStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DraftStatus" AS ENUM (
    'EDITING',
    'VALIDATING',
    'PUBLISHED'
);


--
-- Name: EventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventStatus" AS ENUM (
    'draft',
    'ready',
    'approved',
    'published',
    'live',
    'completed',
    'cancelled'
);


--
-- Name: FieldSection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FieldSection" AS ENUM (
    'event',
    'crew',
    'contract'
);


--
-- Name: FieldType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FieldType" AS ENUM (
    'text',
    'number',
    'date',
    'time',
    'dropdown',
    'checkbox',
    'textarea'
);


--
-- Name: ImportJobMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ImportJobMode" AS ENUM (
    'full',
    'incremental',
    'backfill'
);


--
-- Name: ImportJobStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ImportJobStatus" AS ENUM (
    'queued',
    'running',
    'completed',
    'failed',
    'partial'
);


--
-- Name: ImportSourceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ImportSourceKind" AS ENUM (
    'api',
    'file'
);


--
-- Name: IntegrationDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."IntegrationDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND',
    'BIDIRECTIONAL'
);


--
-- Name: IntegrationLogStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."IntegrationLogStatus" AS ENUM (
    'success',
    'failed',
    'partial'
);


--
-- Name: MergeCandidateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MergeCandidateStatus" AS ENUM (
    'pending',
    'approved_merge',
    'create_new',
    'ignored'
);


--
-- Name: OutboxPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OutboxPriority" AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT'
);


--
-- Name: OverrunStrategy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OverrunStrategy" AS ENUM (
    'EXTEND',
    'CONDITIONAL_SWITCH',
    'HARD_CUT',
    'SPLIT_SCREEN'
);


--
-- Name: Platform; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Platform" AS ENUM (
    'LINEAR',
    'OTT',
    'SVOD',
    'AVOD',
    'PPV',
    'STREAMING'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'planner',
    'sports',
    'contracts',
    'admin'
);


--
-- Name: RunStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RunStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'RECONCILED',
    'DISPUTED'
);


--
-- Name: RunType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RunType" AS ENUM (
    'LIVE',
    'CONTINUATION',
    'TAPE_DELAY',
    'HIGHLIGHTS',
    'CLIP'
);


--
-- Name: SchedulingMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SchedulingMode" AS ENUM (
    'FIXED',
    'FLOATING',
    'WINDOW'
);


--
-- Name: SettingScopeKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SettingScopeKind" AS ENUM (
    'global',
    'role',
    'user',
    'user_role'
);


--
-- Name: StageType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StageType" AS ENUM (
    'LEAGUE',
    'GROUP',
    'KNOCKOUT',
    'QUALIFIER',
    'TOURNAMENT_MAIN'
);


--
-- Name: SwitchExecutionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SwitchExecutionStatus" AS ENUM (
    'PENDING',
    'EXECUTING',
    'COMPLETED',
    'FAILED'
);


--
-- Name: SwitchTriggerType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SwitchTriggerType" AS ENUM (
    'CONDITIONAL',
    'REACTIVE',
    'EMERGENCY',
    'HARD_CUT',
    'COURT_SWITCH'
);


--
-- Name: SyncStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SyncStatus" AS ENUM (
    'success',
    'failed',
    'partial'
);


--
-- Name: ValidationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ValidationStatus" AS ENUM (
    'pending',
    'valid',
    'invalid',
    'quarantined'
);


--
-- Name: cleanup_expired_locks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_locks() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM encoder_locks WHERE expires_at < NOW();
END;
$$;


--
-- Name: notify_outbox_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_outbox_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM pg_notify('outbox_events', NEW.id::text);
  RETURN NEW;
END;
$$;


--
-- Name: set_tenant_context(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_tenant_context(tid uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM set_config('app.tenant_id', tid::text, true);
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AdapterConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdapterConfig" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "adapterType" public."AdapterType" NOT NULL,
    direction public."AdapterDirection" NOT NULL,
    "providerName" text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastSuccessAt" timestamp with time zone,
    "lastFailureAt" timestamp with time zone,
    "consecutiveFailures" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: AppSetting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AppSetting" (
    id text NOT NULL,
    key text NOT NULL,
    "scopeKind" public."SettingScopeKind" NOT NULL,
    "scopeId" text NOT NULL,
    "userId" text,
    value jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "userId" text,
    action text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "oldValue" jsonb,
    "newValue" jsonb,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: BroadcastSlot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BroadcastSlot" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "channelId" integer,
    "eventId" integer,
    "schedulingMode" public."SchedulingMode" DEFAULT 'FIXED'::public."SchedulingMode" NOT NULL,
    "plannedStartUtc" timestamp with time zone,
    "plannedEndUtc" timestamp with time zone,
    "estimatedStartUtc" timestamp with time zone,
    "estimatedEndUtc" timestamp with time zone,
    "earliestStartUtc" timestamp with time zone,
    "latestStartUtc" timestamp with time zone,
    "actualStartUtc" timestamp with time zone,
    "actualEndUtc" timestamp with time zone,
    "bufferBeforeMin" integer DEFAULT 15 NOT NULL,
    "bufferAfterMin" integer DEFAULT 25 NOT NULL,
    "expectedDurationMin" integer,
    "overrunStrategy" public."OverrunStrategy" DEFAULT 'EXTEND'::public."OverrunStrategy" NOT NULL,
    "conditionalTriggerUtc" timestamp with time zone,
    "conditionalTargetChannelId" integer,
    "anchorType" public."AnchorType" DEFAULT 'FIXED_TIME'::public."AnchorType" NOT NULL,
    "coveragePriority" integer DEFAULT 1 NOT NULL,
    "fallbackEventId" integer,
    status public."BroadcastSlotStatus" DEFAULT 'PLANNED'::public."BroadcastSlotStatus" NOT NULL,
    "contentSegment" public."ContentSegment" DEFAULT 'FULL'::public."ContentSegment" NOT NULL,
    "scheduleVersionId" uuid,
    "sportMetadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "autoLinked" boolean DEFAULT false NOT NULL
);


--
-- Name: CanonicalCompetition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CanonicalCompetition" (
    id text NOT NULL,
    "primaryName" text NOT NULL,
    "sportId" integer NOT NULL,
    "countryCode" text,
    "logoUrl" text,
    "primarySourceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: CanonicalTeam; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CanonicalTeam" (
    id text NOT NULL,
    "primaryName" text NOT NULL,
    "countryCode" text,
    "sportId" integer NOT NULL,
    "logoUrl" text,
    "primarySourceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: CanonicalVenue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CanonicalVenue" (
    id text NOT NULL,
    "primaryName" text NOT NULL,
    city text,
    "countryCode" text,
    capacity integer,
    "primarySourceId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: CascadeEstimate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CascadeEstimate" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "eventId" integer NOT NULL,
    "estimatedStartUtc" timestamp with time zone,
    "earliestStartUtc" timestamp with time zone,
    "latestStartUtc" timestamp with time zone,
    "estDurationShortMin" integer,
    "estDurationLongMin" integer,
    "confidenceScore" double precision DEFAULT 0.5 NOT NULL,
    "inputsUsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "computedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Channel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Channel" (
    id integer NOT NULL,
    "tenantId" uuid NOT NULL,
    name text NOT NULL,
    timezone text DEFAULT 'Europe/Brussels'::text NOT NULL,
    "broadcastDayStartLocal" text DEFAULT '06:00'::text NOT NULL,
    "epgConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    color text DEFAULT '#3B82F6'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "parentId" integer,
    "platformConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    types text[] DEFAULT ARRAY['linear'::text]
);


--
-- Name: ChannelSwitchAction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChannelSwitchAction" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "fromSlotId" uuid NOT NULL,
    "toChannelId" integer NOT NULL,
    "toSlotId" uuid,
    "triggerType" public."SwitchTriggerType" NOT NULL,
    "switchAtUtc" timestamp with time zone,
    "reasonCode" text NOT NULL,
    "reasonText" text,
    "confirmedBy" text,
    "confirmedAt" timestamp with time zone,
    "executionStatus" public."SwitchExecutionStatus" DEFAULT 'PENDING'::public."SwitchExecutionStatus" NOT NULL,
    "autoConfirmed" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Channel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Channel_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Channel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Channel_id_seq" OWNED BY public."Channel".id;


--
-- Name: Competition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Competition" (
    id integer NOT NULL,
    "sportId" integer NOT NULL,
    name text NOT NULL,
    matches integer NOT NULL,
    season text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: CompetitionAlias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompetitionAlias" (
    id text NOT NULL,
    "canonicalCompetitionId" text NOT NULL,
    "sourceId" text,
    alias text NOT NULL,
    "normalizedAlias" text NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Competition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Competition_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Competition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Competition_id_seq" OWNED BY public."Competition".id;


--
-- Name: Contract; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contract" (
    id integer NOT NULL,
    "competitionId" integer NOT NULL,
    status public."ContractStatus" DEFAULT 'none'::public."ContractStatus" NOT NULL,
    "validFrom" timestamp(3) without time zone,
    "validUntil" timestamp(3) without time zone,
    "linearRights" boolean DEFAULT false NOT NULL,
    "maxRights" boolean DEFAULT false NOT NULL,
    "radioRights" boolean DEFAULT false NOT NULL,
    sublicensing boolean DEFAULT false NOT NULL,
    "geoRestriction" text,
    fee text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL,
    "coverageType" text DEFAULT 'LIVE'::text NOT NULL,
    "maxLiveRuns" integer,
    "maxPickRunsPerRound" integer,
    platforms text[] DEFAULT ARRAY[]::text[],
    "seasonId" integer,
    "tapeDelayHoursMin" integer,
    territory text[] DEFAULT ARRAY[]::text[],
    "windowEndUtc" timestamp with time zone,
    "windowStartUtc" timestamp with time zone,
    "blackoutPeriods" jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: Contract_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Contract_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Contract_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Contract_id_seq" OWNED BY public."Contract".id;


--
-- Name: Court; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Court" (
    id integer NOT NULL,
    "tenantId" uuid NOT NULL,
    "venueId" integer NOT NULL,
    name text NOT NULL,
    capacity integer,
    "hasRoof" boolean DEFAULT false NOT NULL,
    "isShowCourt" boolean DEFAULT false NOT NULL,
    "broadcastPriority" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Court_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Court_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Court_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Court_id_seq" OWNED BY public."Court".id;


--
-- Name: CustomFieldValue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomFieldValue" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "fieldId" text NOT NULL,
    "fieldValue" text NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: DropdownList; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DropdownList" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "managedBy" public."Role" DEFAULT 'admin'::public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: DropdownOption; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DropdownOption" (
    id text NOT NULL,
    "listId" text NOT NULL,
    value text NOT NULL,
    label text NOT NULL,
    "parentId" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Encoder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Encoder" (
    id integer NOT NULL,
    name text NOT NULL,
    location text,
    "isActive" boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: EncoderLock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EncoderLock" (
    "encoderName" text NOT NULL,
    "lockedById" text NOT NULL,
    "planId" integer NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Encoder_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Encoder_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Encoder_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Encoder_id_seq" OWNED BY public."Encoder".id;


--
-- Name: Event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Event" (
    id integer NOT NULL,
    "sportId" integer NOT NULL,
    "competitionId" integer NOT NULL,
    "createdById" text,
    phase text,
    category text,
    participants text NOT NULL,
    content text,
    "startDateBE" timestamp(3) without time zone NOT NULL,
    "startTimeBE" text NOT NULL,
    "startDateOrigin" timestamp(3) without time zone,
    "startTimeOrigin" text,
    complex text,
    "livestreamDate" timestamp(3) without time zone,
    "livestreamTime" text,
    "linearChannel" text,
    "radioChannel" text,
    "linearStartTime" text,
    "isLive" boolean DEFAULT false NOT NULL,
    "isDelayedLive" boolean DEFAULT false NOT NULL,
    "videoRef" text,
    winner text,
    score text,
    duration text,
    "customFields" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "onDemandChannel" text,
    "seriesId" text,
    status public."EventStatus" DEFAULT 'draft'::public."EventStatus" NOT NULL,
    "tenantId" uuid NOT NULL,
    "venueId" integer,
    "seasonId" integer,
    "stageId" integer,
    "roundId" integer,
    "schedulingMode" public."SchedulingMode" DEFAULT 'FIXED'::public."SchedulingMode" NOT NULL,
    "sportMetadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "externalRefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "channelId" integer,
    "durationMin" integer,
    "onDemandChannelId" integer,
    "radioChannelId" integer
);


--
-- Name: Event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Event_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Event_id_seq" OWNED BY public."Event".id;


--
-- Name: FieldDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldDefinition" (
    id text NOT NULL,
    name text NOT NULL,
    label text NOT NULL,
    "fieldType" public."FieldType" NOT NULL,
    section public."FieldSection" NOT NULL,
    required boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    options text[],
    "dropdownSourceId" text,
    "defaultValue" text,
    "conditionalRules" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "visibleByRoles" public."Role"[],
    "isSystem" boolean DEFAULT false NOT NULL,
    "isCustom" boolean DEFAULT true NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: FieldProvenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldProvenance" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "fieldName" text NOT NULL,
    "sourceId" text NOT NULL,
    "sourceRecordId" text NOT NULL,
    "sourceUpdatedAt" timestamp(3) without time zone,
    "importedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ImportDeadLetter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportDeadLetter" (
    id text NOT NULL,
    "jobId" text,
    "sourceId" text NOT NULL,
    "sourceRecordId" text,
    "rawPayload" jsonb NOT NULL,
    "errorMessage" text NOT NULL,
    "errorType" text NOT NULL,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "lastRetryAt" timestamp(3) without time zone,
    "nextRetryAt" timestamp(3) without time zone,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ImportJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportJob" (
    id text NOT NULL,
    "sourceId" text NOT NULL,
    "entityScope" text NOT NULL,
    mode public."ImportJobMode" NOT NULL,
    status public."ImportJobStatus" DEFAULT 'queued'::public."ImportJobStatus" NOT NULL,
    "idempotencyKey" text,
    cursor text,
    "startedAt" timestamp(3) without time zone,
    "finishedAt" timestamp(3) without time zone,
    "statsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "errorLog" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ImportRateLimit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportRateLimit" (
    "sourceId" text NOT NULL,
    "requestsThisMinute" integer DEFAULT 0 NOT NULL,
    "requestsThisDay" integer DEFAULT 0 NOT NULL,
    "minuteWindowStart" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dayWindowStart" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastRequestAt" timestamp(3) without time zone,
    "tenantId" uuid NOT NULL
);


--
-- Name: ImportRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportRecord" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    "sourceId" text NOT NULL,
    "sourceRecordId" text NOT NULL,
    "sourceUpdatedAt" timestamp(3) without time zone,
    "entityType" text NOT NULL,
    "payloadJson" jsonb NOT NULL,
    "payloadHash" text NOT NULL,
    "normalizedJson" jsonb,
    "normalizedHash" text,
    "validationStatus" public."ValidationStatus" DEFAULT 'pending'::public."ValidationStatus" NOT NULL,
    "validationErrors" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "isSuperseded" boolean DEFAULT false NOT NULL,
    "supersededByJobId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ImportSchedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportSchedule" (
    id text NOT NULL,
    "sourceId" text NOT NULL,
    "cronExpr" text NOT NULL,
    "isEnabled" boolean DEFAULT true NOT NULL,
    "lastRunAt" timestamp(3) without time zone,
    "nextRunAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ImportSource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportSource" (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    kind public."ImportSourceKind" NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    "isEnabled" boolean DEFAULT true NOT NULL,
    "configJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "rateLimitPerMinute" integer,
    "rateLimitPerDay" integer,
    "lastFetchAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ImportSourceLink; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportSourceLink" (
    id text NOT NULL,
    "sourceId" text NOT NULL,
    "sourceRecordId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    confidence numeric(5,2) NOT NULL,
    "matchMethod" text NOT NULL,
    "isManual" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Integration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Integration" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    name text NOT NULL,
    direction public."IntegrationDirection" NOT NULL,
    "templateCode" text NOT NULL,
    credentials text,
    "fieldOverrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "triggerConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "rateLimitPerMinute" integer,
    "rateLimitPerDay" integer,
    "lastSuccessAt" timestamp with time zone,
    "lastFailureAt" timestamp with time zone,
    "consecutiveFailures" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: IntegrationLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IntegrationLog" (
    id uuid NOT NULL,
    "integrationId" uuid NOT NULL,
    direction public."IntegrationDirection" NOT NULL,
    status public."IntegrationLogStatus" NOT NULL,
    "requestMeta" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "responseMeta" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "recordCount" integer DEFAULT 0 NOT NULL,
    "errorMessage" text,
    "durationMs" integer,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: IntegrationSchedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IntegrationSchedule" (
    id uuid NOT NULL,
    "integrationId" uuid NOT NULL,
    "cronExpression" text NOT NULL,
    "jobType" text NOT NULL,
    "jobConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastRunAt" timestamp with time zone,
    "nextRunAt" timestamp with time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: MandatoryFieldConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MandatoryFieldConfig" (
    id text NOT NULL,
    "sportId" integer NOT NULL,
    "fieldIds" text[],
    "conditionalRequired" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: MergeCandidate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MergeCandidate" (
    id text NOT NULL,
    "importRecordId" text NOT NULL,
    "entityType" text NOT NULL,
    "suggestedEntityId" text,
    confidence numeric(5,2) NOT NULL,
    "reasonCodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
    status public."MergeCandidateStatus" DEFAULT 'pending'::public."MergeCandidateStatus" NOT NULL,
    "reviewedBy" text,
    "reviewedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    "entityType" text,
    "entityId" text,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: OutboxEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OutboxEvent" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "eventType" text NOT NULL,
    "aggregateType" text NOT NULL,
    "aggregateId" text NOT NULL,
    payload jsonb NOT NULL,
    "idempotencyKey" text NOT NULL,
    priority public."OutboxPriority" DEFAULT 'NORMAL'::public."OutboxPriority" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp with time zone,
    "failedAt" timestamp with time zone,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "maxRetries" integer DEFAULT 5 NOT NULL,
    "deadLetteredAt" timestamp with time zone
);


--
-- Name: Resource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Resource" (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    capacity integer DEFAULT 1 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ResourceAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ResourceAssignment" (
    id integer NOT NULL,
    "resourceId" integer NOT NULL,
    "techPlanId" integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ResourceAssignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ResourceAssignment_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ResourceAssignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ResourceAssignment_id_seq" OWNED BY public."ResourceAssignment".id;


--
-- Name: Resource_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Resource_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Resource_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Resource_id_seq" OWNED BY public."Resource".id;


--
-- Name: RightsPolicy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RightsPolicy" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "competitionId" integer NOT NULL,
    "seasonId" integer,
    territory text[],
    platforms public."Platform"[],
    "coverageType" public."CoverageType" DEFAULT 'LIVE'::public."CoverageType" NOT NULL,
    "maxLiveRuns" integer,
    "maxPickRunsPerRound" integer,
    "windowStartUtc" timestamp with time zone,
    "windowEndUtc" timestamp with time zone,
    "tapeDelayHoursMin" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Round; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Round" (
    id integer NOT NULL,
    "tenantId" uuid NOT NULL,
    "stageId" integer NOT NULL,
    name text NOT NULL,
    "roundNumber" integer NOT NULL,
    "scheduledDateStart" date,
    "scheduledDateEnd" date,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Round_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Round_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Round_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Round_id_seq" OWNED BY public."Round".id;


--
-- Name: RunLedger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RunLedger" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "broadcastSlotId" uuid NOT NULL,
    "eventId" integer NOT NULL,
    "channelId" integer NOT NULL,
    "runType" public."RunType" DEFAULT 'LIVE'::public."RunType" NOT NULL,
    "parentRunId" uuid,
    "startedAtUtc" timestamp with time zone,
    "endedAtUtc" timestamp with time zone,
    "durationMin" integer,
    status public."RunStatus" DEFAULT 'PENDING'::public."RunStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "contractId" integer
);


--
-- Name: SavedView; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SavedView" (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    context text NOT NULL,
    "filterState" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: ScheduleDraft; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScheduleDraft" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "channelId" integer,
    "dateRangeStart" date NOT NULL,
    "dateRangeEnd" date NOT NULL,
    operations jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status public."DraftStatus" DEFAULT 'EDITING'::public."DraftStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ScheduleVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScheduleVersion" (
    id uuid NOT NULL,
    "tenantId" uuid NOT NULL,
    "channelId" integer,
    "draftId" uuid NOT NULL,
    "versionNumber" integer NOT NULL,
    snapshot jsonb NOT NULL,
    "publishedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "publishedBy" text NOT NULL,
    "isEmergency" boolean DEFAULT false NOT NULL,
    "reasonCode" text,
    "acknowledgedWarnings" jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: Season; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Season" (
    id integer NOT NULL,
    "tenantId" uuid NOT NULL,
    "competitionId" integer NOT NULL,
    name text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    "sportMetadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Season_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Season_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Season_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Season_id_seq" OWNED BY public."Season".id;


--
-- Name: Sport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Sport" (
    id integer NOT NULL,
    name text NOT NULL,
    icon text NOT NULL,
    federation text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Sport_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Sport_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Sport_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Sport_id_seq" OWNED BY public."Sport".id;


--
-- Name: Stage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Stage" (
    id integer NOT NULL,
    "tenantId" uuid NOT NULL,
    "seasonId" integer NOT NULL,
    name text NOT NULL,
    "stageType" public."StageType" NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "advancementRules" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "sportMetadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Stage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Stage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Stage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Stage_id_seq" OWNED BY public."Stage".id;


--
-- Name: SyncHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SyncHistory" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text,
    "sourceCode" text NOT NULL,
    "syncType" text NOT NULL,
    "triggeredBy" text,
    status public."SyncStatus" NOT NULL,
    "recordsProcessed" integer DEFAULT 0 NOT NULL,
    "recordsCreated" integer DEFAULT 0 NOT NULL,
    "recordsUpdated" integer DEFAULT 0 NOT NULL,
    "recordsSkipped" integer DEFAULT 0 NOT NULL,
    "errorMessage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Team" (
    id integer NOT NULL,
    "tenantId" uuid NOT NULL,
    name text NOT NULL,
    "shortName" text,
    country text,
    "logoUrl" text,
    "externalRefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: TeamAlias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TeamAlias" (
    id text NOT NULL,
    "canonicalTeamId" text NOT NULL,
    "sourceId" text,
    alias text NOT NULL,
    "normalizedAlias" text NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Team_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Team_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Team_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Team_id_seq" OWNED BY public."Team".id;


--
-- Name: TechPlan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TechPlan" (
    id integer NOT NULL,
    "eventId" integer NOT NULL,
    "planType" text NOT NULL,
    crew jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isLivestream" boolean DEFAULT false NOT NULL,
    "customFields" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: TechPlan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."TechPlan_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: TechPlan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."TechPlan_id_seq" OWNED BY public."TechPlan".id;


--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tenant" (
    id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    name text,
    avatar text,
    role public."Role" DEFAULT 'planner'::public."Role" NOT NULL,
    "externalId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Venue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Venue" (
    id integer NOT NULL,
    "tenantId" uuid NOT NULL,
    name text NOT NULL,
    timezone text DEFAULT 'Europe/Brussels'::text NOT NULL,
    country text,
    address text,
    capacity integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: VenueAlias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VenueAlias" (
    id text NOT NULL,
    "canonicalVenueId" text NOT NULL,
    "sourceId" text,
    alias text NOT NULL,
    "normalizedAlias" text NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: Venue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Venue_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Venue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Venue_id_seq" OWNED BY public."Venue".id;


--
-- Name: WebhookDelivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookDelivery" (
    id text NOT NULL,
    "webhookId" text NOT NULL,
    "eventType" text NOT NULL,
    payload jsonb NOT NULL,
    "statusCode" integer,
    attempts integer DEFAULT 0 NOT NULL,
    "deliveredAt" timestamp(3) without time zone,
    error text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tenantId" uuid NOT NULL,
    "outboxEventId" uuid
);


--
-- Name: WebhookEndpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookEndpoint" (
    id text NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    events text[],
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdById" text,
    "tenantId" uuid NOT NULL
);


--
-- Name: _FieldDefinitionToMandatoryFieldConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."_FieldDefinitionToMandatoryFieldConfig" (
    "A" text NOT NULL,
    "B" text NOT NULL
);


--
-- Name: crew_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crew_members (
    id integer NOT NULL,
    name text NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    email text,
    phone text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: crew_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crew_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crew_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crew_members_id_seq OWNED BY public.crew_members.id;


--
-- Name: crew_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crew_templates (
    id integer NOT NULL,
    name text NOT NULL,
    "planType" text,
    "crewData" jsonb NOT NULL,
    "createdById" character varying(36),
    "isShared" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenantId" uuid NOT NULL
);


--
-- Name: crew_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crew_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crew_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crew_templates_id_seq OWNED BY public.crew_templates.id;


--
-- Name: Channel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Channel" ALTER COLUMN id SET DEFAULT nextval('public."Channel_id_seq"'::regclass);


--
-- Name: Competition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Competition" ALTER COLUMN id SET DEFAULT nextval('public."Competition_id_seq"'::regclass);


--
-- Name: Contract id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contract" ALTER COLUMN id SET DEFAULT nextval('public."Contract_id_seq"'::regclass);


--
-- Name: Court id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Court" ALTER COLUMN id SET DEFAULT nextval('public."Court_id_seq"'::regclass);


--
-- Name: Encoder id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Encoder" ALTER COLUMN id SET DEFAULT nextval('public."Encoder_id_seq"'::regclass);


--
-- Name: Event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event" ALTER COLUMN id SET DEFAULT nextval('public."Event_id_seq"'::regclass);


--
-- Name: Resource id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Resource" ALTER COLUMN id SET DEFAULT nextval('public."Resource_id_seq"'::regclass);


--
-- Name: ResourceAssignment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResourceAssignment" ALTER COLUMN id SET DEFAULT nextval('public."ResourceAssignment_id_seq"'::regclass);


--
-- Name: Round id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Round" ALTER COLUMN id SET DEFAULT nextval('public."Round_id_seq"'::regclass);


--
-- Name: Season id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Season" ALTER COLUMN id SET DEFAULT nextval('public."Season_id_seq"'::regclass);


--
-- Name: Sport id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sport" ALTER COLUMN id SET DEFAULT nextval('public."Sport_id_seq"'::regclass);


--
-- Name: Stage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Stage" ALTER COLUMN id SET DEFAULT nextval('public."Stage_id_seq"'::regclass);


--
-- Name: Team id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Team" ALTER COLUMN id SET DEFAULT nextval('public."Team_id_seq"'::regclass);


--
-- Name: TechPlan id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TechPlan" ALTER COLUMN id SET DEFAULT nextval('public."TechPlan_id_seq"'::regclass);


--
-- Name: Venue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Venue" ALTER COLUMN id SET DEFAULT nextval('public."Venue_id_seq"'::regclass);


--
-- Name: crew_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew_members ALTER COLUMN id SET DEFAULT nextval('public.crew_members_id_seq'::regclass);


--
-- Name: crew_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew_templates ALTER COLUMN id SET DEFAULT nextval('public.crew_templates_id_seq'::regclass);


--
-- Name: AdapterConfig AdapterConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdapterConfig"
    ADD CONSTRAINT "AdapterConfig_pkey" PRIMARY KEY (id);


--
-- Name: AppSetting AppSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AppSetting"
    ADD CONSTRAINT "AppSetting_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: BroadcastSlot BroadcastSlot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_pkey" PRIMARY KEY (id);


--
-- Name: CanonicalCompetition CanonicalCompetition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalCompetition"
    ADD CONSTRAINT "CanonicalCompetition_pkey" PRIMARY KEY (id);


--
-- Name: CanonicalTeam CanonicalTeam_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalTeam"
    ADD CONSTRAINT "CanonicalTeam_pkey" PRIMARY KEY (id);


--
-- Name: CanonicalVenue CanonicalVenue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalVenue"
    ADD CONSTRAINT "CanonicalVenue_pkey" PRIMARY KEY (id);


--
-- Name: CascadeEstimate CascadeEstimate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CascadeEstimate"
    ADD CONSTRAINT "CascadeEstimate_pkey" PRIMARY KEY (id);


--
-- Name: ChannelSwitchAction ChannelSwitchAction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChannelSwitchAction"
    ADD CONSTRAINT "ChannelSwitchAction_pkey" PRIMARY KEY (id);


--
-- Name: Channel Channel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Channel"
    ADD CONSTRAINT "Channel_pkey" PRIMARY KEY (id);


--
-- Name: CompetitionAlias CompetitionAlias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompetitionAlias"
    ADD CONSTRAINT "CompetitionAlias_pkey" PRIMARY KEY (id);


--
-- Name: Competition Competition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Competition"
    ADD CONSTRAINT "Competition_pkey" PRIMARY KEY (id);


--
-- Name: Contract Contract_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_pkey" PRIMARY KEY (id);


--
-- Name: Court Court_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Court"
    ADD CONSTRAINT "Court_pkey" PRIMARY KEY (id);


--
-- Name: CustomFieldValue CustomFieldValue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY (id);


--
-- Name: DropdownList DropdownList_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DropdownList"
    ADD CONSTRAINT "DropdownList_pkey" PRIMARY KEY (id);


--
-- Name: DropdownOption DropdownOption_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DropdownOption"
    ADD CONSTRAINT "DropdownOption_pkey" PRIMARY KEY (id);


--
-- Name: EncoderLock EncoderLock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EncoderLock"
    ADD CONSTRAINT "EncoderLock_pkey" PRIMARY KEY ("encoderName");


--
-- Name: Encoder Encoder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Encoder"
    ADD CONSTRAINT "Encoder_pkey" PRIMARY KEY (id);


--
-- Name: Event Event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_pkey" PRIMARY KEY (id);


--
-- Name: FieldDefinition FieldDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY (id);


--
-- Name: FieldProvenance FieldProvenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldProvenance"
    ADD CONSTRAINT "FieldProvenance_pkey" PRIMARY KEY (id);


--
-- Name: ImportDeadLetter ImportDeadLetter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportDeadLetter"
    ADD CONSTRAINT "ImportDeadLetter_pkey" PRIMARY KEY (id);


--
-- Name: ImportJob ImportJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportJob"
    ADD CONSTRAINT "ImportJob_pkey" PRIMARY KEY (id);


--
-- Name: ImportRateLimit ImportRateLimit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportRateLimit"
    ADD CONSTRAINT "ImportRateLimit_pkey" PRIMARY KEY ("sourceId");


--
-- Name: ImportRecord ImportRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportRecord"
    ADD CONSTRAINT "ImportRecord_pkey" PRIMARY KEY (id);


--
-- Name: ImportSchedule ImportSchedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSchedule"
    ADD CONSTRAINT "ImportSchedule_pkey" PRIMARY KEY (id);


--
-- Name: ImportSourceLink ImportSourceLink_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSourceLink"
    ADD CONSTRAINT "ImportSourceLink_pkey" PRIMARY KEY (id);


--
-- Name: ImportSource ImportSource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSource"
    ADD CONSTRAINT "ImportSource_pkey" PRIMARY KEY (id);


--
-- Name: IntegrationLog IntegrationLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntegrationLog"
    ADD CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY (id);


--
-- Name: IntegrationSchedule IntegrationSchedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntegrationSchedule"
    ADD CONSTRAINT "IntegrationSchedule_pkey" PRIMARY KEY (id);


--
-- Name: Integration Integration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Integration"
    ADD CONSTRAINT "Integration_pkey" PRIMARY KEY (id);


--
-- Name: MandatoryFieldConfig MandatoryFieldConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MandatoryFieldConfig"
    ADD CONSTRAINT "MandatoryFieldConfig_pkey" PRIMARY KEY (id);


--
-- Name: MergeCandidate MergeCandidate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MergeCandidate"
    ADD CONSTRAINT "MergeCandidate_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: OutboxEvent OutboxEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboxEvent"
    ADD CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY (id);


--
-- Name: ResourceAssignment ResourceAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResourceAssignment"
    ADD CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY (id);


--
-- Name: Resource Resource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Resource"
    ADD CONSTRAINT "Resource_pkey" PRIMARY KEY (id);


--
-- Name: RightsPolicy RightsPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RightsPolicy"
    ADD CONSTRAINT "RightsPolicy_pkey" PRIMARY KEY (id);


--
-- Name: Round Round_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Round"
    ADD CONSTRAINT "Round_pkey" PRIMARY KEY (id);


--
-- Name: RunLedger RunLedger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RunLedger"
    ADD CONSTRAINT "RunLedger_pkey" PRIMARY KEY (id);


--
-- Name: SavedView SavedView_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavedView"
    ADD CONSTRAINT "SavedView_pkey" PRIMARY KEY (id);


--
-- Name: ScheduleDraft ScheduleDraft_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleDraft"
    ADD CONSTRAINT "ScheduleDraft_pkey" PRIMARY KEY (id);


--
-- Name: ScheduleDraft ScheduleDraft_tenantId_channelId_dateRangeStart_dateRangeEn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleDraft"
    ADD CONSTRAINT "ScheduleDraft_tenantId_channelId_dateRangeStart_dateRangeEn_key" UNIQUE ("tenantId", "channelId", "dateRangeStart", "dateRangeEnd");


--
-- Name: ScheduleVersion ScheduleVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleVersion"
    ADD CONSTRAINT "ScheduleVersion_pkey" PRIMARY KEY (id);


--
-- Name: Season Season_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Season"
    ADD CONSTRAINT "Season_pkey" PRIMARY KEY (id);


--
-- Name: Season Season_tenantId_competitionId_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Season"
    ADD CONSTRAINT "Season_tenantId_competitionId_name_key" UNIQUE ("tenantId", "competitionId", name);


--
-- Name: Sport Sport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sport"
    ADD CONSTRAINT "Sport_pkey" PRIMARY KEY (id);


--
-- Name: Stage Stage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Stage"
    ADD CONSTRAINT "Stage_pkey" PRIMARY KEY (id);


--
-- Name: SyncHistory SyncHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SyncHistory"
    ADD CONSTRAINT "SyncHistory_pkey" PRIMARY KEY (id);


--
-- Name: TeamAlias TeamAlias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamAlias"
    ADD CONSTRAINT "TeamAlias_pkey" PRIMARY KEY (id);


--
-- Name: Team Team_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Team"
    ADD CONSTRAINT "Team_pkey" PRIMARY KEY (id);


--
-- Name: TechPlan TechPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TechPlan"
    ADD CONSTRAINT "TechPlan_pkey" PRIMARY KEY (id);


--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VenueAlias VenueAlias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VenueAlias"
    ADD CONSTRAINT "VenueAlias_pkey" PRIMARY KEY (id);


--
-- Name: Venue Venue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Venue"
    ADD CONSTRAINT "Venue_pkey" PRIMARY KEY (id);


--
-- Name: WebhookDelivery WebhookDelivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY (id);


--
-- Name: WebhookEndpoint WebhookEndpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookEndpoint"
    ADD CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY (id);


--
-- Name: crew_members crew_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew_members
    ADD CONSTRAINT crew_members_pkey PRIMARY KEY (id);


--
-- Name: crew_templates crew_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew_templates
    ADD CONSTRAINT crew_templates_pkey PRIMARY KEY (id);


--
-- Name: AdapterConfig_tenantId_adapterType_providerName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AdapterConfig_tenantId_adapterType_providerName_key" ON public."AdapterConfig" USING btree ("tenantId", "adapterType", "providerName");


--
-- Name: AdapterConfig_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdapterConfig_tenantId_idx" ON public."AdapterConfig" USING btree ("tenantId");


--
-- Name: AppSetting_scopeKind_scopeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AppSetting_scopeKind_scopeId_idx" ON public."AppSetting" USING btree ("scopeKind", "scopeId");


--
-- Name: AppSetting_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AppSetting_tenantId_idx" ON public."AppSetting" USING btree ("tenantId");


--
-- Name: AppSetting_tenantId_key_scopeKind_scopeId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AppSetting_tenantId_key_scopeKind_scopeId_key" ON public."AppSetting" USING btree ("tenantId", key, "scopeKind", "scopeId");


--
-- Name: AppSetting_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AppSetting_userId_idx" ON public."AppSetting" USING btree ("userId");


--
-- Name: AuditLog_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_action_idx" ON public."AuditLog" USING btree (action);


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");


--
-- Name: AuditLog_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_entityType_entityId_idx" ON public."AuditLog" USING btree ("entityType", "entityId");


--
-- Name: AuditLog_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_tenantId_idx" ON public."AuditLog" USING btree ("tenantId");


--
-- Name: AuditLog_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_userId_idx" ON public."AuditLog" USING btree ("userId");


--
-- Name: BroadcastSlot_channelId_plannedStartUtc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BroadcastSlot_channelId_plannedStartUtc_idx" ON public."BroadcastSlot" USING btree ("channelId", "plannedStartUtc");


--
-- Name: BroadcastSlot_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BroadcastSlot_eventId_idx" ON public."BroadcastSlot" USING btree ("eventId");


--
-- Name: BroadcastSlot_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "BroadcastSlot_tenantId_idx" ON public."BroadcastSlot" USING btree ("tenantId");


--
-- Name: BroadcastSlot_tenant_event_autolinked_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BroadcastSlot_tenant_event_autolinked_key" ON public."BroadcastSlot" USING btree ("tenantId", "eventId") WHERE (("autoLinked" = true) AND ("eventId" IS NOT NULL));


--
-- Name: CanonicalCompetition_sportId_primaryName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CanonicalCompetition_sportId_primaryName_key" ON public."CanonicalCompetition" USING btree ("sportId", "primaryName");


--
-- Name: CanonicalCompetition_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CanonicalCompetition_tenantId_idx" ON public."CanonicalCompetition" USING btree ("tenantId");


--
-- Name: CanonicalTeam_sportId_primaryName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CanonicalTeam_sportId_primaryName_key" ON public."CanonicalTeam" USING btree ("sportId", "primaryName");


--
-- Name: CanonicalTeam_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CanonicalTeam_tenantId_idx" ON public."CanonicalTeam" USING btree ("tenantId");


--
-- Name: CanonicalVenue_primaryName_city_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CanonicalVenue_primaryName_city_key" ON public."CanonicalVenue" USING btree ("primaryName", city);


--
-- Name: CanonicalVenue_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CanonicalVenue_tenantId_idx" ON public."CanonicalVenue" USING btree ("tenantId");


--
-- Name: CascadeEstimate_tenantId_eventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CascadeEstimate_tenantId_eventId_key" ON public."CascadeEstimate" USING btree ("tenantId", "eventId");


--
-- Name: CascadeEstimate_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CascadeEstimate_tenantId_idx" ON public."CascadeEstimate" USING btree ("tenantId");


--
-- Name: ChannelSwitchAction_fromSlotId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChannelSwitchAction_fromSlotId_idx" ON public."ChannelSwitchAction" USING btree ("fromSlotId");


--
-- Name: ChannelSwitchAction_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChannelSwitchAction_tenantId_idx" ON public."ChannelSwitchAction" USING btree ("tenantId");


--
-- Name: ChannelSwitchAction_toChannelId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ChannelSwitchAction_toChannelId_idx" ON public."ChannelSwitchAction" USING btree ("toChannelId");


--
-- Name: Channel_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Channel_parentId_idx" ON public."Channel" USING btree ("parentId");


--
-- Name: Channel_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Channel_tenantId_idx" ON public."Channel" USING btree ("tenantId");


--
-- Name: Channel_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Channel_tenantId_name_key" ON public."Channel" USING btree ("tenantId", name);


--
-- Name: CompetitionAlias_normalizedAlias_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CompetitionAlias_normalizedAlias_idx" ON public."CompetitionAlias" USING btree ("normalizedAlias");


--
-- Name: CompetitionAlias_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CompetitionAlias_tenantId_idx" ON public."CompetitionAlias" USING btree ("tenantId");


--
-- Name: CompetitionAlias_tenantId_sourceId_normalizedAlias_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CompetitionAlias_tenantId_sourceId_normalizedAlias_key" ON public."CompetitionAlias" USING btree ("tenantId", "sourceId", "normalizedAlias");


--
-- Name: Competition_sportId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Competition_sportId_idx" ON public."Competition" USING btree ("sportId");


--
-- Name: Competition_sportId_name_season_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Competition_sportId_name_season_key" ON public."Competition" USING btree ("sportId", name, season);


--
-- Name: Competition_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Competition_tenantId_idx" ON public."Competition" USING btree ("tenantId");


--
-- Name: Contract_competitionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contract_competitionId_idx" ON public."Contract" USING btree ("competitionId");


--
-- Name: Contract_seasonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contract_seasonId_idx" ON public."Contract" USING btree ("seasonId");


--
-- Name: Contract_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contract_status_idx" ON public."Contract" USING btree (status);


--
-- Name: Contract_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contract_tenantId_idx" ON public."Contract" USING btree ("tenantId");


--
-- Name: Contract_validUntil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Contract_validUntil_idx" ON public."Contract" USING btree ("validUntil");


--
-- Name: Court_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Court_tenantId_idx" ON public."Court" USING btree ("tenantId");


--
-- Name: Court_venueId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Court_venueId_name_key" ON public."Court" USING btree ("venueId", name);


--
-- Name: CustomFieldValue_entityType_entityId_fieldId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CustomFieldValue_entityType_entityId_fieldId_key" ON public."CustomFieldValue" USING btree ("entityType", "entityId", "fieldId");


--
-- Name: CustomFieldValue_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_entityType_entityId_idx" ON public."CustomFieldValue" USING btree ("entityType", "entityId");


--
-- Name: CustomFieldValue_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_tenantId_idx" ON public."CustomFieldValue" USING btree ("tenantId");


--
-- Name: DropdownList_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DropdownList_tenantId_idx" ON public."DropdownList" USING btree ("tenantId");


--
-- Name: DropdownOption_listId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DropdownOption_listId_sortOrder_idx" ON public."DropdownOption" USING btree ("listId", "sortOrder");


--
-- Name: DropdownOption_listId_value_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DropdownOption_listId_value_key" ON public."DropdownOption" USING btree ("listId", value);


--
-- Name: DropdownOption_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DropdownOption_tenantId_idx" ON public."DropdownOption" USING btree ("tenantId");


--
-- Name: EncoderLock_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EncoderLock_expiresAt_idx" ON public."EncoderLock" USING btree ("expiresAt");


--
-- Name: EncoderLock_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EncoderLock_tenantId_idx" ON public."EncoderLock" USING btree ("tenantId");


--
-- Name: Encoder_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Encoder_tenantId_idx" ON public."Encoder" USING btree ("tenantId");


--
-- Name: Encoder_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Encoder_tenantId_name_key" ON public."Encoder" USING btree ("tenantId", name);


--
-- Name: Event_channelId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_channelId_idx" ON public."Event" USING btree ("channelId");


--
-- Name: Event_competitionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_competitionId_idx" ON public."Event" USING btree ("competitionId");


--
-- Name: Event_roundId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_roundId_idx" ON public."Event" USING btree ("roundId");


--
-- Name: Event_seasonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_seasonId_idx" ON public."Event" USING btree ("seasonId");


--
-- Name: Event_seriesId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_seriesId_idx" ON public."Event" USING btree ("seriesId");


--
-- Name: Event_sportId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_sportId_idx" ON public."Event" USING btree ("sportId");


--
-- Name: Event_stageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_stageId_idx" ON public."Event" USING btree ("stageId");


--
-- Name: Event_startDateBE_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_startDateBE_idx" ON public."Event" USING btree ("startDateBE");


--
-- Name: Event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_status_idx" ON public."Event" USING btree (status);


--
-- Name: Event_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_tenantId_idx" ON public."Event" USING btree ("tenantId");


--
-- Name: Event_tenantId_sportId_startDateBE_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_tenantId_sportId_startDateBE_idx" ON public."Event" USING btree ("tenantId", "sportId", "startDateBE");


--
-- Name: Event_tenantId_startDateBE_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_tenantId_startDateBE_idx" ON public."Event" USING btree ("tenantId", "startDateBE");


--
-- Name: Event_venueId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_venueId_idx" ON public."Event" USING btree ("venueId");


--
-- Name: FieldDefinition_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FieldDefinition_name_key" ON public."FieldDefinition" USING btree (name);


--
-- Name: FieldDefinition_section_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldDefinition_section_sortOrder_idx" ON public."FieldDefinition" USING btree (section, "sortOrder");


--
-- Name: FieldDefinition_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldDefinition_tenantId_idx" ON public."FieldDefinition" USING btree ("tenantId");


--
-- Name: FieldProvenance_entityType_entityId_fieldName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FieldProvenance_entityType_entityId_fieldName_key" ON public."FieldProvenance" USING btree ("entityType", "entityId", "fieldName");


--
-- Name: FieldProvenance_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldProvenance_entityType_entityId_idx" ON public."FieldProvenance" USING btree ("entityType", "entityId");


--
-- Name: FieldProvenance_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldProvenance_tenantId_idx" ON public."FieldProvenance" USING btree ("tenantId");


--
-- Name: ImportDeadLetter_nextRetryAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportDeadLetter_nextRetryAt_idx" ON public."ImportDeadLetter" USING btree ("nextRetryAt");


--
-- Name: ImportDeadLetter_sourceId_errorType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportDeadLetter_sourceId_errorType_idx" ON public."ImportDeadLetter" USING btree ("sourceId", "errorType");


--
-- Name: ImportDeadLetter_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportDeadLetter_tenantId_idx" ON public."ImportDeadLetter" USING btree ("tenantId");


--
-- Name: ImportJob_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportJob_createdAt_idx" ON public."ImportJob" USING btree ("createdAt");


--
-- Name: ImportJob_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ImportJob_idempotencyKey_key" ON public."ImportJob" USING btree ("idempotencyKey");


--
-- Name: ImportJob_sourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportJob_sourceId_idx" ON public."ImportJob" USING btree ("sourceId");


--
-- Name: ImportJob_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportJob_status_idx" ON public."ImportJob" USING btree (status);


--
-- Name: ImportJob_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportJob_tenantId_idx" ON public."ImportJob" USING btree ("tenantId");


--
-- Name: ImportRateLimit_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportRateLimit_tenantId_idx" ON public."ImportRateLimit" USING btree ("tenantId");


--
-- Name: ImportRecord_entityType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportRecord_entityType_idx" ON public."ImportRecord" USING btree ("entityType");


--
-- Name: ImportRecord_jobId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportRecord_jobId_idx" ON public."ImportRecord" USING btree ("jobId");


--
-- Name: ImportRecord_sourceId_sourceRecordId_entityType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ImportRecord_sourceId_sourceRecordId_entityType_key" ON public."ImportRecord" USING btree ("sourceId", "sourceRecordId", "entityType");


--
-- Name: ImportRecord_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportRecord_tenantId_idx" ON public."ImportRecord" USING btree ("tenantId");


--
-- Name: ImportRecord_validationStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportRecord_validationStatus_idx" ON public."ImportRecord" USING btree ("validationStatus");


--
-- Name: ImportSchedule_sourceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ImportSchedule_sourceId_key" ON public."ImportSchedule" USING btree ("sourceId");


--
-- Name: ImportSchedule_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportSchedule_tenantId_idx" ON public."ImportSchedule" USING btree ("tenantId");


--
-- Name: ImportSourceLink_entityType_entityId_confidence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportSourceLink_entityType_entityId_confidence_idx" ON public."ImportSourceLink" USING btree ("entityType", "entityId", confidence);


--
-- Name: ImportSourceLink_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportSourceLink_entityType_entityId_idx" ON public."ImportSourceLink" USING btree ("entityType", "entityId");


--
-- Name: ImportSourceLink_sourceId_sourceRecordId_entityType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ImportSourceLink_sourceId_sourceRecordId_entityType_key" ON public."ImportSourceLink" USING btree ("sourceId", "sourceRecordId", "entityType");


--
-- Name: ImportSourceLink_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportSourceLink_tenantId_idx" ON public."ImportSourceLink" USING btree ("tenantId");


--
-- Name: ImportSource_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ImportSource_code_key" ON public."ImportSource" USING btree (code);


--
-- Name: ImportSource_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportSource_tenantId_idx" ON public."ImportSource" USING btree ("tenantId");


--
-- Name: IntegrationLog_integrationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationLog_integrationId_createdAt_idx" ON public."IntegrationLog" USING btree ("integrationId", "createdAt" DESC);


--
-- Name: IntegrationLog_integrationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationLog_integrationId_status_idx" ON public."IntegrationLog" USING btree ("integrationId", status);


--
-- Name: IntegrationSchedule_integrationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationSchedule_integrationId_idx" ON public."IntegrationSchedule" USING btree ("integrationId");


--
-- Name: IntegrationSchedule_isActive_nextRunAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationSchedule_isActive_nextRunAt_idx" ON public."IntegrationSchedule" USING btree ("isActive", "nextRunAt");


--
-- Name: Integration_tenantId_direction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Integration_tenantId_direction_idx" ON public."Integration" USING btree ("tenantId", direction);


--
-- Name: Integration_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Integration_tenantId_idx" ON public."Integration" USING btree ("tenantId");


--
-- Name: Integration_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Integration_tenantId_name_key" ON public."Integration" USING btree ("tenantId", name);


--
-- Name: MandatoryFieldConfig_sportId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MandatoryFieldConfig_sportId_idx" ON public."MandatoryFieldConfig" USING btree ("sportId");


--
-- Name: MandatoryFieldConfig_sportId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "MandatoryFieldConfig_sportId_key" ON public."MandatoryFieldConfig" USING btree ("sportId");


--
-- Name: MandatoryFieldConfig_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MandatoryFieldConfig_tenantId_idx" ON public."MandatoryFieldConfig" USING btree ("tenantId");


--
-- Name: MergeCandidate_entityType_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MergeCandidate_entityType_status_idx" ON public."MergeCandidate" USING btree ("entityType", status);


--
-- Name: MergeCandidate_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MergeCandidate_tenantId_idx" ON public."MergeCandidate" USING btree ("tenantId");


--
-- Name: Notification_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notification_createdAt_idx" ON public."Notification" USING btree ("createdAt");


--
-- Name: Notification_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notification_tenantId_idx" ON public."Notification" USING btree ("tenantId");


--
-- Name: Notification_userId_isRead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notification_userId_isRead_idx" ON public."Notification" USING btree ("userId", "isRead");


--
-- Name: OutboxEvent_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OutboxEvent_idempotencyKey_key" ON public."OutboxEvent" USING btree ("idempotencyKey");


--
-- Name: OutboxEvent_processedAt_deadLetteredAt_priority_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OutboxEvent_processedAt_deadLetteredAt_priority_createdAt_idx" ON public."OutboxEvent" USING btree ("processedAt", "deadLetteredAt", priority, "createdAt");


--
-- Name: OutboxEvent_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OutboxEvent_tenantId_idx" ON public."OutboxEvent" USING btree ("tenantId");


--
-- Name: ResourceAssignment_resourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResourceAssignment_resourceId_idx" ON public."ResourceAssignment" USING btree ("resourceId");


--
-- Name: ResourceAssignment_resourceId_techPlanId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ResourceAssignment_resourceId_techPlanId_key" ON public."ResourceAssignment" USING btree ("resourceId", "techPlanId");


--
-- Name: ResourceAssignment_techPlanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResourceAssignment_techPlanId_idx" ON public."ResourceAssignment" USING btree ("techPlanId");


--
-- Name: ResourceAssignment_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ResourceAssignment_tenantId_idx" ON public."ResourceAssignment" USING btree ("tenantId");


--
-- Name: Resource_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Resource_tenantId_idx" ON public."Resource" USING btree ("tenantId");


--
-- Name: Resource_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Resource_tenantId_name_key" ON public."Resource" USING btree ("tenantId", name);


--
-- Name: RightsPolicy_seasonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RightsPolicy_seasonId_idx" ON public."RightsPolicy" USING btree ("seasonId");


--
-- Name: RightsPolicy_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RightsPolicy_tenantId_idx" ON public."RightsPolicy" USING btree ("tenantId");


--
-- Name: Round_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Round_tenantId_idx" ON public."Round" USING btree ("tenantId");


--
-- Name: RunLedger_channelId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RunLedger_channelId_idx" ON public."RunLedger" USING btree ("channelId");


--
-- Name: RunLedger_contractId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RunLedger_contractId_idx" ON public."RunLedger" USING btree ("contractId");


--
-- Name: RunLedger_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RunLedger_eventId_idx" ON public."RunLedger" USING btree ("eventId");


--
-- Name: RunLedger_tenantId_broadcastSlotId_runType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RunLedger_tenantId_broadcastSlotId_runType_key" ON public."RunLedger" USING btree ("tenantId", "broadcastSlotId", "runType");


--
-- Name: RunLedger_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RunLedger_tenantId_idx" ON public."RunLedger" USING btree ("tenantId");


--
-- Name: SavedView_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SavedView_tenantId_idx" ON public."SavedView" USING btree ("tenantId");


--
-- Name: SavedView_userId_context_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SavedView_userId_context_idx" ON public."SavedView" USING btree ("userId", context);


--
-- Name: SavedView_userId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SavedView_userId_name_key" ON public."SavedView" USING btree ("userId", name);


--
-- Name: ScheduleDraft_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScheduleDraft_tenantId_idx" ON public."ScheduleDraft" USING btree ("tenantId");


--
-- Name: ScheduleVersion_draftId_versionNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ScheduleVersion_draftId_versionNumber_key" ON public."ScheduleVersion" USING btree ("draftId", "versionNumber");


--
-- Name: ScheduleVersion_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScheduleVersion_tenantId_idx" ON public."ScheduleVersion" USING btree ("tenantId");


--
-- Name: Season_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Season_tenantId_idx" ON public."Season" USING btree ("tenantId");


--
-- Name: Sport_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Sport_tenantId_idx" ON public."Sport" USING btree ("tenantId");


--
-- Name: Sport_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Sport_tenantId_name_key" ON public."Sport" USING btree ("tenantId", name);


--
-- Name: Stage_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Stage_tenantId_idx" ON public."Stage" USING btree ("tenantId");


--
-- Name: SyncHistory_entityType_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SyncHistory_entityType_createdAt_idx" ON public."SyncHistory" USING btree ("entityType", "createdAt");


--
-- Name: SyncHistory_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SyncHistory_tenantId_idx" ON public."SyncHistory" USING btree ("tenantId");


--
-- Name: SyncHistory_triggeredBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SyncHistory_triggeredBy_idx" ON public."SyncHistory" USING btree ("triggeredBy");


--
-- Name: TeamAlias_normalizedAlias_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TeamAlias_normalizedAlias_idx" ON public."TeamAlias" USING btree ("normalizedAlias");


--
-- Name: TeamAlias_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TeamAlias_tenantId_idx" ON public."TeamAlias" USING btree ("tenantId");


--
-- Name: TeamAlias_tenantId_sourceId_normalizedAlias_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TeamAlias_tenantId_sourceId_normalizedAlias_key" ON public."TeamAlias" USING btree ("tenantId", "sourceId", "normalizedAlias");


--
-- Name: Team_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Team_tenantId_idx" ON public."Team" USING btree ("tenantId");


--
-- Name: Team_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Team_tenantId_name_key" ON public."Team" USING btree ("tenantId", name);


--
-- Name: TechPlan_eventId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TechPlan_eventId_idx" ON public."TechPlan" USING btree ("eventId");


--
-- Name: TechPlan_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TechPlan_tenantId_idx" ON public."TechPlan" USING btree ("tenantId");


--
-- Name: Tenant_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Tenant_slug_key" ON public."Tenant" USING btree (slug);


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_externalId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_externalId_idx" ON public."User" USING btree ("externalId");


--
-- Name: User_externalId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_externalId_key" ON public."User" USING btree ("externalId");


--
-- Name: User_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_tenantId_idx" ON public."User" USING btree ("tenantId");


--
-- Name: VenueAlias_normalizedAlias_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VenueAlias_normalizedAlias_idx" ON public."VenueAlias" USING btree ("normalizedAlias");


--
-- Name: VenueAlias_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "VenueAlias_tenantId_idx" ON public."VenueAlias" USING btree ("tenantId");


--
-- Name: VenueAlias_tenantId_sourceId_normalizedAlias_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "VenueAlias_tenantId_sourceId_normalizedAlias_key" ON public."VenueAlias" USING btree ("tenantId", "sourceId", "normalizedAlias");


--
-- Name: Venue_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Venue_tenantId_idx" ON public."Venue" USING btree ("tenantId");


--
-- Name: Venue_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Venue_tenantId_name_key" ON public."Venue" USING btree ("tenantId", name);


--
-- Name: WebhookDelivery_deliveredAt_attempts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_deliveredAt_attempts_idx" ON public."WebhookDelivery" USING btree ("deliveredAt", attempts);


--
-- Name: WebhookDelivery_deliveredAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_deliveredAt_idx" ON public."WebhookDelivery" USING btree ("deliveredAt");


--
-- Name: WebhookDelivery_eventType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_eventType_idx" ON public."WebhookDelivery" USING btree ("eventType");


--
-- Name: WebhookDelivery_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_tenantId_idx" ON public."WebhookDelivery" USING btree ("tenantId");


--
-- Name: WebhookDelivery_webhookId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON public."WebhookDelivery" USING btree ("webhookId", "createdAt");


--
-- Name: WebhookDelivery_webhookId_outboxEventId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "WebhookDelivery_webhookId_outboxEventId_key" ON public."WebhookDelivery" USING btree ("webhookId", "outboxEventId");


--
-- Name: WebhookEndpoint_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookEndpoint_isActive_idx" ON public."WebhookEndpoint" USING btree ("isActive");


--
-- Name: WebhookEndpoint_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookEndpoint_tenantId_idx" ON public."WebhookEndpoint" USING btree ("tenantId");


--
-- Name: _FieldDefinitionToMandatoryFieldConfig_AB_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "_FieldDefinitionToMandatoryFieldConfig_AB_unique" ON public."_FieldDefinitionToMandatoryFieldConfig" USING btree ("A", "B");


--
-- Name: _FieldDefinitionToMandatoryFieldConfig_B_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "_FieldDefinitionToMandatoryFieldConfig_B_index" ON public."_FieldDefinitionToMandatoryFieldConfig" USING btree ("B");


--
-- Name: crew_members_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX crew_members_name_key ON public.crew_members USING btree (name);


--
-- Name: crew_members_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crew_members_tenantId_idx" ON public.crew_members USING btree ("tenantId");


--
-- Name: crew_templates_planType_createdById_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "crew_templates_planType_createdById_key" ON public.crew_templates USING btree ("planType", "createdById");


--
-- Name: crew_templates_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "crew_templates_tenantId_idx" ON public.crew_templates USING btree ("tenantId");


--
-- Name: event_court_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_court_day_idx ON public."Event" USING btree (((("sportMetadata" ->> 'court_id'::text))::integer), "tenantId", "startDateBE") WHERE ("sportMetadata" ? 'court_id'::text);


--
-- Name: OutboxEvent outbox_event_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outbox_event_notify AFTER INSERT ON public."OutboxEvent" FOR EACH ROW EXECUTE FUNCTION public.notify_outbox_event();


--
-- Name: AdapterConfig AdapterConfig_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdapterConfig"
    ADD CONSTRAINT "AdapterConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AppSetting AppSetting_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AppSetting"
    ADD CONSTRAINT "AppSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AppSetting AppSetting_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AppSetting"
    ADD CONSTRAINT "AppSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AuditLog AuditLog_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: BroadcastSlot BroadcastSlot_channelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BroadcastSlot BroadcastSlot_conditionalTargetChannelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_conditionalTargetChannelId_fkey" FOREIGN KEY ("conditionalTargetChannelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BroadcastSlot BroadcastSlot_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BroadcastSlot BroadcastSlot_fallbackEventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_fallbackEventId_fkey" FOREIGN KEY ("fallbackEventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BroadcastSlot BroadcastSlot_scheduleVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_scheduleVersionId_fkey" FOREIGN KEY ("scheduleVersionId") REFERENCES public."ScheduleVersion"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BroadcastSlot BroadcastSlot_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BroadcastSlot"
    ADD CONSTRAINT "BroadcastSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CanonicalCompetition CanonicalCompetition_primarySourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalCompetition"
    ADD CONSTRAINT "CanonicalCompetition_primarySourceId_fkey" FOREIGN KEY ("primarySourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CanonicalCompetition CanonicalCompetition_sportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalCompetition"
    ADD CONSTRAINT "CanonicalCompetition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES public."Sport"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CanonicalCompetition CanonicalCompetition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalCompetition"
    ADD CONSTRAINT "CanonicalCompetition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CanonicalTeam CanonicalTeam_primarySourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalTeam"
    ADD CONSTRAINT "CanonicalTeam_primarySourceId_fkey" FOREIGN KEY ("primarySourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CanonicalTeam CanonicalTeam_sportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalTeam"
    ADD CONSTRAINT "CanonicalTeam_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES public."Sport"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CanonicalTeam CanonicalTeam_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalTeam"
    ADD CONSTRAINT "CanonicalTeam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CanonicalVenue CanonicalVenue_primarySourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalVenue"
    ADD CONSTRAINT "CanonicalVenue_primarySourceId_fkey" FOREIGN KEY ("primarySourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CanonicalVenue CanonicalVenue_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CanonicalVenue"
    ADD CONSTRAINT "CanonicalVenue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CascadeEstimate CascadeEstimate_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CascadeEstimate"
    ADD CONSTRAINT "CascadeEstimate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CascadeEstimate CascadeEstimate_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CascadeEstimate"
    ADD CONSTRAINT "CascadeEstimate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ChannelSwitchAction ChannelSwitchAction_fromSlotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChannelSwitchAction"
    ADD CONSTRAINT "ChannelSwitchAction_fromSlotId_fkey" FOREIGN KEY ("fromSlotId") REFERENCES public."BroadcastSlot"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ChannelSwitchAction ChannelSwitchAction_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChannelSwitchAction"
    ADD CONSTRAINT "ChannelSwitchAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ChannelSwitchAction ChannelSwitchAction_toChannelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChannelSwitchAction"
    ADD CONSTRAINT "ChannelSwitchAction_toChannelId_fkey" FOREIGN KEY ("toChannelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ChannelSwitchAction ChannelSwitchAction_toSlotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChannelSwitchAction"
    ADD CONSTRAINT "ChannelSwitchAction_toSlotId_fkey" FOREIGN KEY ("toSlotId") REFERENCES public."BroadcastSlot"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Channel Channel_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Channel"
    ADD CONSTRAINT "Channel_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Channel Channel_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Channel"
    ADD CONSTRAINT "Channel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CompetitionAlias CompetitionAlias_canonicalCompetitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompetitionAlias"
    ADD CONSTRAINT "CompetitionAlias_canonicalCompetitionId_fkey" FOREIGN KEY ("canonicalCompetitionId") REFERENCES public."CanonicalCompetition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CompetitionAlias CompetitionAlias_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompetitionAlias"
    ADD CONSTRAINT "CompetitionAlias_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CompetitionAlias CompetitionAlias_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompetitionAlias"
    ADD CONSTRAINT "CompetitionAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Competition Competition_sportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Competition"
    ADD CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES public."Sport"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Competition Competition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Competition"
    ADD CONSTRAINT "Competition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Contract Contract_competitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES public."Competition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Contract Contract_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public."Season"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Contract Contract_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contract"
    ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Court Court_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Court"
    ADD CONSTRAINT "Court_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Court Court_venueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Court"
    ADD CONSTRAINT "Court_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES public."Venue"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomFieldValue CustomFieldValue_fieldId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomFieldValue CustomFieldValue_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DropdownList DropdownList_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DropdownList"
    ADD CONSTRAINT "DropdownList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DropdownOption DropdownOption_listId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DropdownOption"
    ADD CONSTRAINT "DropdownOption_listId_fkey" FOREIGN KEY ("listId") REFERENCES public."DropdownList"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DropdownOption DropdownOption_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DropdownOption"
    ADD CONSTRAINT "DropdownOption_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."DropdownOption"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DropdownOption DropdownOption_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DropdownOption"
    ADD CONSTRAINT "DropdownOption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EncoderLock EncoderLock_lockedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EncoderLock"
    ADD CONSTRAINT "EncoderLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: EncoderLock EncoderLock_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EncoderLock"
    ADD CONSTRAINT "EncoderLock_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."TechPlan"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: EncoderLock EncoderLock_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EncoderLock"
    ADD CONSTRAINT "EncoderLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Encoder Encoder_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Encoder"
    ADD CONSTRAINT "Encoder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Event Event_channelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_competitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES public."Competition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Event Event_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_onDemandChannelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_onDemandChannelId_fkey" FOREIGN KEY ("onDemandChannelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_radioChannelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_radioChannelId_fkey" FOREIGN KEY ("radioChannelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_roundId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES public."Round"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public."Season"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_sportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES public."Sport"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Event Event_stageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES public."Stage"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Event Event_venueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES public."Venue"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FieldDefinition FieldDefinition_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FieldDefinition FieldDefinition_dropdownSourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_dropdownSourceId_fkey" FOREIGN KEY ("dropdownSourceId") REFERENCES public."DropdownList"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FieldDefinition FieldDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FieldProvenance FieldProvenance_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldProvenance"
    ADD CONSTRAINT "FieldProvenance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportDeadLetter ImportDeadLetter_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportDeadLetter"
    ADD CONSTRAINT "ImportDeadLetter_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."ImportJob"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ImportDeadLetter ImportDeadLetter_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportDeadLetter"
    ADD CONSTRAINT "ImportDeadLetter_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportDeadLetter ImportDeadLetter_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportDeadLetter"
    ADD CONSTRAINT "ImportDeadLetter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportJob ImportJob_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportJob"
    ADD CONSTRAINT "ImportJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportJob ImportJob_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportJob"
    ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportRateLimit ImportRateLimit_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportRateLimit"
    ADD CONSTRAINT "ImportRateLimit_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportRateLimit ImportRateLimit_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportRateLimit"
    ADD CONSTRAINT "ImportRateLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportRecord ImportRecord_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportRecord"
    ADD CONSTRAINT "ImportRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."ImportJob"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportRecord ImportRecord_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportRecord"
    ADD CONSTRAINT "ImportRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportRecord ImportRecord_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportRecord"
    ADD CONSTRAINT "ImportRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportSchedule ImportSchedule_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSchedule"
    ADD CONSTRAINT "ImportSchedule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ImportSchedule ImportSchedule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSchedule"
    ADD CONSTRAINT "ImportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportSourceLink ImportSourceLink_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSourceLink"
    ADD CONSTRAINT "ImportSourceLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportSourceLink ImportSourceLink_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSourceLink"
    ADD CONSTRAINT "ImportSourceLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ImportSource ImportSource_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportSource"
    ADD CONSTRAINT "ImportSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: IntegrationLog IntegrationLog_integrationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntegrationLog"
    ADD CONSTRAINT "IntegrationLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public."Integration"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: IntegrationSchedule IntegrationSchedule_integrationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntegrationSchedule"
    ADD CONSTRAINT "IntegrationSchedule_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public."Integration"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Integration Integration_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Integration"
    ADD CONSTRAINT "Integration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MandatoryFieldConfig MandatoryFieldConfig_sportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MandatoryFieldConfig"
    ADD CONSTRAINT "MandatoryFieldConfig_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES public."Sport"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MandatoryFieldConfig MandatoryFieldConfig_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MandatoryFieldConfig"
    ADD CONSTRAINT "MandatoryFieldConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MergeCandidate MergeCandidate_importRecordId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MergeCandidate"
    ADD CONSTRAINT "MergeCandidate_importRecordId_fkey" FOREIGN KEY ("importRecordId") REFERENCES public."ImportRecord"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MergeCandidate MergeCandidate_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MergeCandidate"
    ADD CONSTRAINT "MergeCandidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Notification Notification_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OutboxEvent OutboxEvent_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboxEvent"
    ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ResourceAssignment ResourceAssignment_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResourceAssignment"
    ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public."Resource"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ResourceAssignment ResourceAssignment_techPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResourceAssignment"
    ADD CONSTRAINT "ResourceAssignment_techPlanId_fkey" FOREIGN KEY ("techPlanId") REFERENCES public."TechPlan"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ResourceAssignment ResourceAssignment_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ResourceAssignment"
    ADD CONSTRAINT "ResourceAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Resource Resource_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Resource"
    ADD CONSTRAINT "Resource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RightsPolicy RightsPolicy_competitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RightsPolicy"
    ADD CONSTRAINT "RightsPolicy_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES public."Competition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RightsPolicy RightsPolicy_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RightsPolicy"
    ADD CONSTRAINT "RightsPolicy_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public."Season"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RightsPolicy RightsPolicy_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RightsPolicy"
    ADD CONSTRAINT "RightsPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Round Round_stageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Round"
    ADD CONSTRAINT "Round_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES public."Stage"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Round Round_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Round"
    ADD CONSTRAINT "Round_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RunLedger RunLedger_broadcastSlotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RunLedger"
    ADD CONSTRAINT "RunLedger_broadcastSlotId_fkey" FOREIGN KEY ("broadcastSlotId") REFERENCES public."BroadcastSlot"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RunLedger RunLedger_channelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RunLedger"
    ADD CONSTRAINT "RunLedger_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RunLedger RunLedger_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RunLedger"
    ADD CONSTRAINT "RunLedger_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public."Contract"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RunLedger RunLedger_parentRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RunLedger"
    ADD CONSTRAINT "RunLedger_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES public."RunLedger"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RunLedger RunLedger_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RunLedger"
    ADD CONSTRAINT "RunLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SavedView SavedView_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavedView"
    ADD CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SavedView SavedView_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavedView"
    ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ScheduleDraft ScheduleDraft_channelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleDraft"
    ADD CONSTRAINT "ScheduleDraft_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ScheduleDraft ScheduleDraft_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleDraft"
    ADD CONSTRAINT "ScheduleDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ScheduleVersion ScheduleVersion_channelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleVersion"
    ADD CONSTRAINT "ScheduleVersion_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES public."Channel"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ScheduleVersion ScheduleVersion_draftId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleVersion"
    ADD CONSTRAINT "ScheduleVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES public."ScheduleDraft"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ScheduleVersion ScheduleVersion_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduleVersion"
    ADD CONSTRAINT "ScheduleVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Season Season_competitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Season"
    ADD CONSTRAINT "Season_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES public."Competition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Season Season_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Season"
    ADD CONSTRAINT "Season_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Sport Sport_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sport"
    ADD CONSTRAINT "Sport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Stage Stage_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Stage"
    ADD CONSTRAINT "Stage_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public."Season"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Stage Stage_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Stage"
    ADD CONSTRAINT "Stage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SyncHistory SyncHistory_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SyncHistory"
    ADD CONSTRAINT "SyncHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TeamAlias TeamAlias_canonicalTeamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamAlias"
    ADD CONSTRAINT "TeamAlias_canonicalTeamId_fkey" FOREIGN KEY ("canonicalTeamId") REFERENCES public."CanonicalTeam"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TeamAlias TeamAlias_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamAlias"
    ADD CONSTRAINT "TeamAlias_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: TeamAlias TeamAlias_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamAlias"
    ADD CONSTRAINT "TeamAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Team Team_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Team"
    ADD CONSTRAINT "Team_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TechPlan TechPlan_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TechPlan"
    ADD CONSTRAINT "TechPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: TechPlan TechPlan_eventId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TechPlan"
    ADD CONSTRAINT "TechPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES public."Event"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TechPlan TechPlan_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TechPlan"
    ADD CONSTRAINT "TechPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: User User_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: VenueAlias VenueAlias_canonicalVenueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VenueAlias"
    ADD CONSTRAINT "VenueAlias_canonicalVenueId_fkey" FOREIGN KEY ("canonicalVenueId") REFERENCES public."CanonicalVenue"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: VenueAlias VenueAlias_sourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VenueAlias"
    ADD CONSTRAINT "VenueAlias_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES public."ImportSource"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: VenueAlias VenueAlias_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VenueAlias"
    ADD CONSTRAINT "VenueAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Venue Venue_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Venue"
    ADD CONSTRAINT "Venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: WebhookDelivery WebhookDelivery_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: WebhookDelivery WebhookDelivery_webhookId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDelivery"
    ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES public."WebhookEndpoint"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WebhookEndpoint WebhookEndpoint_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookEndpoint"
    ADD CONSTRAINT "WebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WebhookEndpoint WebhookEndpoint_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookEndpoint"
    ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: _FieldDefinitionToMandatoryFieldConfig _FieldDefinitionToMandatoryFieldConfig_A_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."_FieldDefinitionToMandatoryFieldConfig"
    ADD CONSTRAINT "_FieldDefinitionToMandatoryFieldConfig_A_fkey" FOREIGN KEY ("A") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: _FieldDefinitionToMandatoryFieldConfig _FieldDefinitionToMandatoryFieldConfig_B_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."_FieldDefinitionToMandatoryFieldConfig"
    ADD CONSTRAINT "_FieldDefinitionToMandatoryFieldConfig_B_fkey" FOREIGN KEY ("B") REFERENCES public."MandatoryFieldConfig"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: crew_members crew_members_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew_members
    ADD CONSTRAINT "crew_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: crew_templates crew_templates_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew_templates
    ADD CONSTRAINT "crew_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: crew_templates crew_templates_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crew_templates
    ADD CONSTRAINT "crew_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AdapterConfig; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AdapterConfig" ENABLE ROW LEVEL SECURITY;

--
-- Name: AppSetting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AppSetting" ENABLE ROW LEVEL SECURITY;

--
-- Name: AuditLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: CanonicalCompetition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CanonicalCompetition" ENABLE ROW LEVEL SECURITY;

--
-- Name: CanonicalTeam; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CanonicalTeam" ENABLE ROW LEVEL SECURITY;

--
-- Name: CanonicalVenue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CanonicalVenue" ENABLE ROW LEVEL SECURITY;

--
-- Name: CascadeEstimate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CascadeEstimate" ENABLE ROW LEVEL SECURITY;

--
-- Name: ChannelSwitchAction; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ChannelSwitchAction" ENABLE ROW LEVEL SECURITY;

--
-- Name: Competition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Competition" ENABLE ROW LEVEL SECURITY;

--
-- Name: CompetitionAlias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CompetitionAlias" ENABLE ROW LEVEL SECURITY;

--
-- Name: Contract; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Contract" ENABLE ROW LEVEL SECURITY;

--
-- Name: CustomFieldValue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CustomFieldValue" ENABLE ROW LEVEL SECURITY;

--
-- Name: DropdownList; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DropdownList" ENABLE ROW LEVEL SECURITY;

--
-- Name: DropdownOption; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DropdownOption" ENABLE ROW LEVEL SECURITY;

--
-- Name: Encoder; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Encoder" ENABLE ROW LEVEL SECURITY;

--
-- Name: EncoderLock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."EncoderLock" ENABLE ROW LEVEL SECURITY;

--
-- Name: Event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Event" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldDefinition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FieldDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldProvenance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FieldProvenance" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportDeadLetter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportDeadLetter" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportJob; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportJob" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportRateLimit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportRateLimit" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportRecord; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportRecord" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportSchedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportSchedule" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportSource; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportSource" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportSourceLink; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportSourceLink" ENABLE ROW LEVEL SECURITY;

--
-- Name: MandatoryFieldConfig; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."MandatoryFieldConfig" ENABLE ROW LEVEL SECURITY;

--
-- Name: MergeCandidate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."MergeCandidate" ENABLE ROW LEVEL SECURITY;

--
-- Name: Notification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

--
-- Name: OutboxEvent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OutboxEvent" ENABLE ROW LEVEL SECURITY;

--
-- Name: Resource; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Resource" ENABLE ROW LEVEL SECURITY;

--
-- Name: ResourceAssignment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ResourceAssignment" ENABLE ROW LEVEL SECURITY;

--
-- Name: RightsPolicy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RightsPolicy" ENABLE ROW LEVEL SECURITY;

--
-- Name: Round; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Round" ENABLE ROW LEVEL SECURITY;

--
-- Name: RunLedger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RunLedger" ENABLE ROW LEVEL SECURITY;

--
-- Name: SavedView; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SavedView" ENABLE ROW LEVEL SECURITY;

--
-- Name: Season; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Season" ENABLE ROW LEVEL SECURITY;

--
-- Name: Sport; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Sport" ENABLE ROW LEVEL SECURITY;

--
-- Name: Stage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Stage" ENABLE ROW LEVEL SECURITY;

--
-- Name: SyncHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SyncHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: TeamAlias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TeamAlias" ENABLE ROW LEVEL SECURITY;

--
-- Name: TechPlan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TechPlan" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: VenueAlias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."VenueAlias" ENABLE ROW LEVEL SECURITY;

--
-- Name: WebhookDelivery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WebhookDelivery" ENABLE ROW LEVEL SECURITY;

--
-- Name: WebhookEndpoint; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WebhookEndpoint" ENABLE ROW LEVEL SECURITY;

--
-- Name: AdapterConfig adapter_config_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY adapter_config_tenant_isolation ON public."AdapterConfig" USING ((("tenantId")::text = current_setting('app.tenant_id'::text, true)));


--
-- Name: CascadeEstimate cascade_estimate_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cascade_estimate_tenant_isolation ON public."CascadeEstimate" USING ((("tenantId")::text = current_setting('app.tenant_id'::text, true)));


--
-- Name: ChannelSwitchAction channel_switch_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channel_switch_tenant_isolation ON public."ChannelSwitchAction" USING ((("tenantId")::text = current_setting('app.tenant_id'::text, true)));


--
-- Name: crew_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

--
-- Name: crew_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crew_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: AppSetting tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."AppSetting" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: AuditLog tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."AuditLog" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: CanonicalCompetition tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."CanonicalCompetition" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: CanonicalTeam tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."CanonicalTeam" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: CanonicalVenue tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."CanonicalVenue" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Competition tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Competition" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: CompetitionAlias tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."CompetitionAlias" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Contract tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Contract" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: CustomFieldValue tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."CustomFieldValue" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: DropdownList tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."DropdownList" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: DropdownOption tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."DropdownOption" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Encoder tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Encoder" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: EncoderLock tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."EncoderLock" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Event tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Event" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: FieldDefinition tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."FieldDefinition" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: FieldProvenance tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."FieldProvenance" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ImportDeadLetter tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ImportDeadLetter" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ImportJob tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ImportJob" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ImportRateLimit tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ImportRateLimit" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ImportRecord tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ImportRecord" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ImportSchedule tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ImportSchedule" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ImportSource tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ImportSource" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ImportSourceLink tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ImportSourceLink" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: MandatoryFieldConfig tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."MandatoryFieldConfig" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: MergeCandidate tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."MergeCandidate" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Notification tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Notification" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: OutboxEvent tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."OutboxEvent" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Resource tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Resource" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ResourceAssignment tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."ResourceAssignment" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Round tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Round" USING (("tenantId" = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: SavedView tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."SavedView" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Season tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Season" USING (("tenantId" = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: Sport tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Sport" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: Stage tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."Stage" USING (("tenantId" = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: SyncHistory tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."SyncHistory" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: TeamAlias tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."TeamAlias" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: TechPlan tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."TechPlan" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: User tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."User" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: VenueAlias tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."VenueAlias" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: WebhookDelivery tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."WebhookDelivery" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: WebhookEndpoint tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public."WebhookEndpoint" USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: crew_members tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.crew_members USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: crew_templates tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.crew_templates USING (("tenantId" = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: RightsPolicy tenant_isolation_rights_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_rights_policy ON public."RightsPolicy" USING ((("tenantId")::text = current_setting('app.tenant_id'::text, true)));


--
-- Name: RunLedger tenant_isolation_run_ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_run_ledger ON public."RunLedger" USING ((("tenantId")::text = current_setting('app.tenant_id'::text, true)));


--
-- PostgreSQL database dump complete
--


