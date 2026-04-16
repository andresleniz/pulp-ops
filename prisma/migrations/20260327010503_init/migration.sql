-- CreateEnum
CREATE TYPE "PriceStatus" AS ENUM ('not_started', 'negotiating', 'decided', 'revised');

-- CreateEnum
CREATE TYPE "CommStatus" AS ENUM ('not_needed', 'pending', 'drafted', 'sent', 'confirmed');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('none', 'discussed', 'agreed', 'ordered', 'shipped', 'closed');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('open', 'in_progress', 'awaiting_confirmation', 'closed', 'on_hold');

-- CreateEnum
CREATE TYPE "EmailDraftStatus" AS ENUM ('pending', 'draft_ready', 'sent', 'confirmed', 'corrected', 'resent');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('missing_price', 'missing_index', 'pending_announcement', 'pending_confirmation', 'hold_review', 'negotiation_followup');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('high', 'med', 'low');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('open', 'agreed', 'rejected', 'pending', 'withdrawn');

-- CreateEnum
CREATE TYPE "PricingMethod" AS ENUM ('manual', 'index_formula', 'subgroup_adjustment', 'customer_override');

-- CreateEnum
CREATE TYPE "ConfirmationType" AS ENUM ('verbal', 'email', 'order');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('flat', 'formula_override', 'subgroup', 'verbal_only', 'no_announcement', 'delayed_start');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "requiresAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "communicationType" TEXT NOT NULL DEFAULT 'email',
    "agentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "subgroupId" TEXT,
    "isDirectContact" BOOLEAN NOT NULL DEFAULT false,
    "contactEmail" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subgroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subgroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "customerId" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fiber" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'USD/ADT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fiber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'USD/ADT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexValue" (
    "id" TEXT NOT NULL,
    "indexId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "publicationDate" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "fiberId" TEXT NOT NULL,
    "millId" TEXT,
    "subgroupId" TEXT,
    "method" "PricingMethod" NOT NULL,
    "formulaExpression" TEXT,
    "formulaReadable" TEXT,
    "manualPrice" DECIMAL(10,2),
    "adjustment" DECIMAL(10,2),
    "priority" INTEGER NOT NULL DEFAULT 99,
    "activeFrom" TEXT NOT NULL,
    "activeTo" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerException" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fiberId" TEXT NOT NULL,
    "adjustmentType" "AdjustmentType" NOT NULL,
    "flatAdjustment" DECIMAL(10,2),
    "formulaOverride" TEXT,
    "noAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "verbalOnly" BOOLEAN NOT NULL DEFAULT false,
    "delayedStart" TEXT,
    "notes" TEXT,
    "activeFrom" TEXT NOT NULL,
    "activeTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyCycle" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "cycleStatus" "CycleStatus" NOT NULL DEFAULT 'open',
    "priceStatus" "PriceStatus" NOT NULL DEFAULT 'not_started',
    "commStatus" "CommStatus" NOT NULL DEFAULT 'pending',
    "orderStatus" "OrderStatus" NOT NULL DEFAULT 'none',
    "onHold" BOOLEAN NOT NULL DEFAULT false,
    "holdReason" TEXT,
    "holdReviewDate" TIMESTAMP(3),
    "confirmationType" "ConfirmationType",
    "confirmationReceived" BOOLEAN NOT NULL DEFAULT false,
    "confirmationDate" TIMESTAMP(3),
    "confirmationRef" TEXT,
    "owner" TEXT NOT NULL DEFAULT 'Andrés',
    "internalNotes" TEXT,
    "externalNotes" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPrice" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "fiberId" TEXT NOT NULL,
    "millId" TEXT,
    "customerId" TEXT,
    "price" DECIMAL(10,2),
    "pricingMethod" "PricingMethod",
    "formulaSnapshot" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "indexSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "marketId" TEXT,
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "templateId" TEXT,
    "marketId" TEXT,
    "customerId" TEXT,
    "agentId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientsTo" TEXT[],
    "recipientsCc" TEXT[],
    "status" "EmailDraftStatus" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cycleId" TEXT,
    "marketId" TEXT,
    "customerId" TEXT,
    "type" "TaskType" NOT NULL,
    "dueDate" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'med',
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationEvent" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "month" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "cycleId" TEXT,
    "customerId" TEXT,
    "fiberId" TEXT NOT NULL,
    "discussedPrice" DECIMAL(10,2),
    "status" "NegotiationStatus" NOT NULL DEFAULT 'open',
    "summary" TEXT,
    "nextStep" TEXT,
    "owner" TEXT NOT NULL DEFAULT 'Andrés',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegotiationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRecord" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fiberId" TEXT NOT NULL,
    "millId" TEXT,
    "volume" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'agreed',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL DEFAULT 'system',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketId" TEXT,
    "month" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'system',

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Market_name_key" ON "Market"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Fiber_code_key" ON "Fiber"("code");

-- CreateIndex
CREATE UNIQUE INDEX "IndexDefinition_name_key" ON "IndexDefinition"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IndexValue_indexId_month_key" ON "IndexValue"("indexId", "month");

-- CreateIndex
CREATE INDEX "PricingRule_marketId_fiberId_idx" ON "PricingRule"("marketId", "fiberId");

-- CreateIndex
CREATE INDEX "MonthlyCycle_month_idx" ON "MonthlyCycle"("month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyCycle_month_marketId_key" ON "MonthlyCycle"("month", "marketId");

-- CreateIndex
CREATE INDEX "MonthlyPrice_cycleId_idx" ON "MonthlyPrice"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPrice_cycleId_fiberId_millId_customerId_key" ON "MonthlyPrice"("cycleId", "fiberId", "millId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_templateKey_version_key" ON "EmailTemplate"("templateKey", "version");

-- CreateIndex
CREATE INDEX "EmailDraft_cycleId_idx" ON "EmailDraft"("cycleId");

-- CreateIndex
CREATE INDEX "Task_month_status_idx" ON "Task"("month", "status");

-- CreateIndex
CREATE INDEX "NegotiationEvent_marketId_month_idx" ON "NegotiationEvent"("marketId", "month");

-- CreateIndex
CREATE INDEX "OrderRecord_cycleId_idx" ON "OrderRecord"("cycleId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_changedAt_idx" ON "AuditLog"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_cycleId_key" ON "Snapshot"("cycleId");

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_subgroupId_fkey" FOREIGN KEY ("subgroupId") REFERENCES "Subgroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subgroup" ADD CONSTRAINT "Subgroup_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mill" ADD CONSTRAINT "Mill_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mill" ADD CONSTRAINT "Mill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndexValue" ADD CONSTRAINT "IndexValue_indexId_fkey" FOREIGN KEY ("indexId") REFERENCES "IndexDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_fiberId_fkey" FOREIGN KEY ("fiberId") REFERENCES "Fiber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_millId_fkey" FOREIGN KEY ("millId") REFERENCES "Mill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_subgroupId_fkey" FOREIGN KEY ("subgroupId") REFERENCES "Subgroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerException" ADD CONSTRAINT "CustomerException_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerException" ADD CONSTRAINT "CustomerException_fiberId_fkey" FOREIGN KEY ("fiberId") REFERENCES "Fiber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyCycle" ADD CONSTRAINT "MonthlyCycle_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPrice" ADD CONSTRAINT "MonthlyPrice_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MonthlyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPrice" ADD CONSTRAINT "MonthlyPrice_fiberId_fkey" FOREIGN KEY ("fiberId") REFERENCES "Fiber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPrice" ADD CONSTRAINT "MonthlyPrice_millId_fkey" FOREIGN KEY ("millId") REFERENCES "Mill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPrice" ADD CONSTRAINT "MonthlyPrice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MonthlyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MonthlyCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationEvent" ADD CONSTRAINT "NegotiationEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationEvent" ADD CONSTRAINT "NegotiationEvent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MonthlyCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationEvent" ADD CONSTRAINT "NegotiationEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationEvent" ADD CONSTRAINT "NegotiationEvent_fiberId_fkey" FOREIGN KEY ("fiberId") REFERENCES "Fiber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecord" ADD CONSTRAINT "OrderRecord_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MonthlyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecord" ADD CONSTRAINT "OrderRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecord" ADD CONSTRAINT "OrderRecord_fiberId_fkey" FOREIGN KEY ("fiberId") REFERENCES "Fiber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRecord" ADD CONSTRAINT "OrderRecord_millId_fkey" FOREIGN KEY ("millId") REFERENCES "Mill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MonthlyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
