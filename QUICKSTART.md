# NexusLaw Quick Start Guide

**AI-powered legal document analysis** - Accelerate contract review, legal research, and compliance monitoring with intelligent document processing.

---

## The NexusLaw Advantage

| Feature | Traditional Approach | NexusLaw |
|---------|---------------------|----------|
| Contract Review | Manual line-by-line | AI-assisted analysis |
| Issue Detection | Human review only | AI flagging + human review |
| Legal Research | Multiple databases | Unified search interface |
| Compliance Monitoring | Periodic audits | Continuous monitoring |

**Time savings vary based on document complexity and review requirements.**

---

## Prerequisites

| Requirement | Minimum | Purpose |
|-------------|---------|---------|
| Nexus Platform | v1.0.0+ | Plugin runtime |
| Node.js | v20+ | SDK (TypeScript) |
| Python | v3.9+ | SDK (Python) |
| API Key | - | Authentication |

---

## Installation (Choose Your Method)

### Method 1: Nexus Marketplace (Recommended)

1. Navigate to **Marketplace** in your Nexus Dashboard
2. Search for "NexusLaw"
3. Click **Install** and select your tier
4. The plugin activates automatically within 60 seconds

### Method 2: Nexus CLI

```bash
nexus plugin install nexus-law
nexus config set LAW_API_KEY your-api-key-here
```

### Method 3: Direct API

```bash
curl -X POST "https://api.adverant.ai/v1/plugins/install" \
  -H "Authorization: Bearer YOUR_NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pluginId": "nexus-law",
    "tier": "professional",
    "autoActivate": true
  }'
```

---

## Your First 5 Minutes: Analyze a Contract

### Step 1: Set Your API Key

```bash
export NEXUS_API_KEY="your-api-key-here"
```

### Step 2: Submit a Document for Analysis

```bash
curl -X POST "https://api.adverant.ai/proxy/nexus-law/api/v1/documents/analyze" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "documentUrl": "https://storage.example.com/contracts/vendor-agreement.pdf",
    "documentType": "vendor_agreement",
    "analysisTypes": ["risks", "obligations", "key_terms", "compliance"],
    "compareToStandard": true
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc_Abc123Xyz",
    "documentType": "vendor_agreement",
    "status": "analyzed",
    "summary": {
      "parties": ["Acme Corp", "TechVendor Inc"],
      "effectiveDate": "2026-01-15",
      "termYears": 3,
      "totalValue": 450000
    },
    "risks": [
      {
        "severity": "high",
        "clause": "Limitation of Liability",
        "issue": "Liability cap below industry standard (2x vs 3x annual fees)",
        "recommendation": "Negotiate cap to 3x annual fees minimum",
        "location": "Section 8.2, Page 12"
      },
      {
        "severity": "medium",
        "clause": "Termination",
        "issue": "90-day notice required, no termination for convenience",
        "recommendation": "Add termination for convenience with 60-day notice",
        "location": "Section 11.1, Page 15"
      }
    ],
    "obligations": [
      {
        "party": "Acme Corp",
        "obligation": "Payment within 30 days of invoice",
        "deadline": "Monthly",
        "location": "Section 4.2"
      }
    ],
    "keyTerms": {
      "autoRenewal": true,
      "governingLaw": "Delaware",
      "disputeResolution": "Arbitration - AAA Rules",
      "confidentialityYears": 5
    },
    "complianceFlags": [
      {
        "regulation": "GDPR",
        "status": "partial",
        "gaps": ["Missing DPA addendum", "No sub-processor clause"]
      }
    ],
    "analyzedAt": "2026-01-01T10:00:00Z"
  }
}
```

---

## Core API Endpoints

**Base URL:** `https://api.adverant.ai/proxy/nexus-law/api/v1`

### Document Analysis

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| `POST` | `/documents/analyze` | Analyze a legal document | 100/min |
| `GET` | `/documents/:id` | Get analysis results | 300/min |
| `POST` | `/documents/compare` | Compare two documents | 50/min |

### Legal Research

```bash
# Execute legal research query
curl -X POST "https://api.adverant.ai/proxy/nexus-law/api/v1/research/query" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key precedents for limitation of liability clauses in software licensing agreements?",
    "jurisdiction": "US-Federal",
    "dateRange": "2020-2026",
    "sources": ["case_law", "statutes", "secondary"]
  }'
```

**Response:**
```json
{
  "queryId": "query_789",
  "results": [
    {
      "type": "case_law",
      "citation": "ABC Corp v. XYZ Inc., 542 F.3d 112 (2d Cir. 2023)",
      "relevance": 0.94,
      "summary": "Court upheld liability cap at 2x annual fees where buyer had negotiating power",
      "keyHolding": "Limitation of liability clauses in B2B software contracts are enforceable when freely negotiated"
    }
  ],
  "aiSummary": "Key precedents establish that limitation of liability clauses in software agreements are generally enforceable in B2B contexts...",
  "citationNetwork": {
    "nodes": 15,
    "keyPrecedents": ["case_123", "case_456"]
  }
}
```

### Compliance Checking

```bash
# Run compliance check
curl -X POST "https://api.adverant.ai/proxy/nexus-law/api/v1/compliance/check" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "doc_Abc123Xyz",
    "regulations": ["GDPR", "CCPA", "SOC2"],
    "generateReport": true
  }'
```

---

## SDK Examples

### TypeScript/JavaScript

```bash
npm install @adverant/nexus-sdk
```

```typescript
import { NexusClient } from '@adverant/nexus-sdk';

const nexus = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY!
});

const law = nexus.plugin('nexus-law');

// Analyze a contract
const analysis = await law.documents.analyze({
  documentUrl: 'https://storage.example.com/contract.pdf',
  documentType: 'vendor_agreement',
  analysisTypes: ['risks', 'obligations', 'key_terms']
});

console.log(`Found ${analysis.risks.length} risks`);

// Display high-risk items
analysis.risks
  .filter(r => r.severity === 'high')
  .forEach(risk => {
    console.log(`HIGH RISK: ${risk.issue}`);
    console.log(`  Location: ${risk.location}`);
    console.log(`  Recommendation: ${risk.recommendation}`);
  });

// Conduct legal research
const research = await law.research.query({
  query: 'Enforceability of non-compete clauses in California',
  jurisdiction: 'US-CA',
  sources: ['case_law', 'statutes']
});

console.log(`Found ${research.results.length} relevant sources`);
console.log(`AI Summary: ${research.aiSummary}`);
```

### Python

```bash
pip install nexus-sdk
```

```python
import os
from nexus_sdk import NexusClient

client = NexusClient(api_key=os.environ["NEXUS_API_KEY"])
law = client.plugin("nexus-law")

# Analyze a contract
analysis = law.documents.analyze(
    document_url="https://storage.example.com/contract.pdf",
    document_type="vendor_agreement",
    analysis_types=["risks", "obligations", "compliance"]
)

print(f"Document: {analysis.document_id}")
print(f"Parties: {', '.join(analysis.summary.parties)}")

# Review risks
for risk in analysis.risks:
    print(f"[{risk.severity.upper()}] {risk.clause}: {risk.issue}")

# Run compliance check
compliance = law.compliance.check(
    document_id=analysis.document_id,
    regulations=["GDPR", "CCPA"],
    generate_report=True
)

for gap in compliance.gaps:
    print(f"Compliance Gap ({gap.regulation}): {gap.description}")
```

---

## Pricing

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| **Monthly Price** | $99 | $399 | Custom |
| **Seats** | 3 | 15 | Unlimited |
| **Documents/Month** | 100 | 1,000 | Unlimited |
| **Contract Review** | Basic | Advanced | Advanced |
| **Legal Research** | Limited | Full | Full + Premium |
| **Citation Networks** | - | Yes | Yes |
| **Compliance Checking** | - | Basic | Advanced |
| **Custom Models** | - | - | Yes |
| **API Access** | Limited | Full | Full |

**14-day free trial. No credit card required.**

[Start Free Trial](https://marketplace.adverant.ai/plugins/nexus-law)

---

## Rate Limits

| Tier | Requests/Minute | Documents/Month | Timeout |
|------|-----------------|-----------------|---------|
| Starter | 30 | 100 | 120s |
| Professional | 100 | 1,000 | 600s |
| Enterprise | Custom | Unlimited | Custom |

---

## Next Steps

1. **[Use Cases Guide](./USE-CASES.md)** - 5 detailed legal AI scenarios
2. **[Architecture Overview](./ARCHITECTURE.md)** - System design and NLP models
3. **[API Reference](./docs/api-reference/endpoints.md)** - Complete endpoint documentation

---

## Support

| Channel | Response Time | Availability |
|---------|---------------|--------------|
| **Documentation** | Instant | [docs.adverant.ai/plugins/law](https://docs.adverant.ai/plugins/law) |
| **Community Forum** | < 4 hours | [community.adverant.ai](https://community.adverant.ai) |
| **Email Support** | < 24 hours | plugins@adverant.ai |
| **Priority Support** | < 1 hour | Enterprise only |

---

*NexusLaw is built and maintained by [Adverant](https://adverant.ai) - Verified Nexus Plugin Developer*
