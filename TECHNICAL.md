# NexusLaw Technical Specification

Complete technical reference for integrating the NexusLaw legal AI plugin.

---

## API Reference

### Base URL

```
https://api.adverant.ai/proxy/nexus-law/api/v1/law
```

All endpoints require authentication via Bearer token in the Authorization header.

---

### Endpoints

#### Analyze Legal Document

```http
POST /documents/analyze
```

Analyzes a legal document using multi-agent AI for contract review, risk assessment, and clause extraction.

**Request Body:**
```json
{
  "documentUrl": "https://storage.example.com/contract.pdf",
  "documentType": "contract | agreement | nda | lease | policy | other",
  "analysisType": "contract-review | due-diligence | compliance | summary",
  "options": {
    "extractClauses": true,
    "riskScoring": true,
    "generateSummary": true,
    "compareToTemplate": "standard-services-agreement",
    "jurisdiction": "US-CA",
    "language": "en"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysisId": "ana_law123",
    "status": "completed",
    "documentType": "contract",
    "pageCount": 15,
    "riskAssessment": {
      "overallScore": 72,
      "riskLevel": "medium",
      "factors": [
        {
          "category": "liability",
          "score": 45,
          "issues": 2
        },
        {
          "category": "termination",
          "score": 85,
          "issues": 0
        }
      ]
    },
    "summary": "Standard services agreement between Company A and Company B...",
    "keyFindings": [
      {
        "type": "risk",
        "severity": "high",
        "clause": "Unlimited liability clause in Section 8.2",
        "section": "8.2",
        "recommendation": "Negotiate liability cap of 12 months fees",
        "benchmark": "Industry standard is 1-2x annual contract value"
      }
    ],
    "extractedClauses": {
      "termination": {
        "section": "12.1",
        "text": "Either party may terminate...",
        "noticePeriod": "30 days"
      },
      "indemnification": {
        "section": "8.2",
        "text": "Provider shall indemnify...",
        "unlimited": true
      },
      "confidentiality": {
        "section": "6.1",
        "text": "All confidential information...",
        "duration": "3 years"
      }
    },
    "parties": [
      {
        "name": "Acme Corporation",
        "role": "client",
        "jurisdiction": "Delaware"
      },
      {
        "name": "Tech Solutions Inc",
        "role": "provider",
        "jurisdiction": "California"
      }
    ],
    "keyDates": {
      "effectiveDate": "2024-02-01",
      "termEndDate": "2025-01-31",
      "renewalNoticeDate": "2024-12-01"
    },
    "financialTerms": {
      "totalValue": 250000,
      "paymentTerms": "Net 30",
      "currency": "USD"
    }
  }
}
```

---

#### Get Document Analysis Results

```http
GET /documents/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysisId": "ana_law123",
    "status": "completed",
    "documentUrl": "https://storage.example.com/contract.pdf",
    "documentType": "contract",
    "analysisType": "contract-review",
    "results": {
      "riskAssessment": {...},
      "summary": "...",
      "keyFindings": [...],
      "extractedClauses": {...}
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:32:15Z"
  }
}
```

---

#### Execute Legal Research Query

```http
POST /research/query
```

Performs semantic search across case law, statutes, and regulations.

**Request Body:**
```json
{
  "query": "employer liability for employee data breach negligence",
  "jurisdiction": ["US-Federal", "US-CA", "US-NY"],
  "sources": ["case_law", "statutes", "regulations", "secondary"],
  "dateRange": {
    "start": "2018-01-01",
    "end": "2024-01-31"
  },
  "filters": {
    "courtLevel": ["supreme", "appellate", "district"],
    "citation": true,
    "goodLaw": true
  },
  "limit": 25,
  "includeSummaries": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "queryId": "res_xyz789",
    "totalResults": 156,
    "results": [
      {
        "id": "case_abc123",
        "type": "case_law",
        "title": "Smith v. DataCorp Inc.",
        "citation": "456 F.3d 789 (9th Cir. 2023)",
        "court": "Ninth Circuit Court of Appeals",
        "date": "2023-06-15",
        "relevanceScore": 0.95,
        "summary": "Court held employer liable for data breach...",
        "keyHoldings": [
          "Employers have duty to implement reasonable data security",
          "Negligence standard applies to data breach prevention"
        ],
        "citedBy": 23,
        "goodLaw": true,
        "fullTextUrl": "https://api.adverant.ai/..."
      }
    ],
    "suggestedQueries": [
      "data breach notification requirements California",
      "CCPA employer obligations"
    ],
    "relatedStatutes": [
      {
        "citation": "Cal. Civ. Code § 1798.100",
        "title": "California Consumer Privacy Act",
        "relevance": 0.88
      }
    ]
  }
}
```

---

#### Get Citation Network

```http
GET /citations/:caseId
```

Returns the citation network for a specific case showing precedent relationships.

**Query Parameters:**
- `depth`: Number of citation levels (default: 2, max: 5)
- `direction`: `cited_by | cites | both`
- `limit`: Max citations per level

**Response:**
```json
{
  "success": true,
  "data": {
    "caseId": "case_abc123",
    "case": {
      "title": "Smith v. DataCorp Inc.",
      "citation": "456 F.3d 789 (9th Cir. 2023)",
      "date": "2023-06-15"
    },
    "citationNetwork": {
      "nodes": [
        {
          "id": "case_abc123",
          "title": "Smith v. DataCorp Inc.",
          "citation": "456 F.3d 789",
          "court": "9th Cir.",
          "date": "2023",
          "type": "source"
        },
        {
          "id": "case_def456",
          "title": "Brown v. SecureTech",
          "citation": "234 F.3d 567",
          "court": "9th Cir.",
          "date": "2021",
          "type": "cited"
        }
      ],
      "edges": [
        {
          "source": "case_abc123",
          "target": "case_def456",
          "relationship": "cites",
          "treatment": "followed",
          "depth": 1
        }
      ]
    },
    "statistics": {
      "totalCitations": 45,
      "citedByCases": 23,
      "citesToCases": 22,
      "averageDepth": 2.3,
      "keyPrecedents": [
        {
          "caseId": "case_xyz",
          "title": "Landmark Privacy Case",
          "importance": 0.95
        }
      ]
    }
  }
}
```

---

#### Run Compliance Check

```http
POST /compliance/check
```

Checks documents or policies against regulatory requirements.

**Request Body:**
```json
{
  "documentUrl": "https://storage.example.com/privacy-policy.pdf",
  "frameworks": ["GDPR", "CCPA", "HIPAA"],
  "checkType": "full | gap_analysis | requirement_mapping",
  "options": {
    "includeRemediation": true,
    "generateReport": true,
    "compareToPrevious": "analysis_prev123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "checkId": "comp_abc123",
    "status": "completed",
    "overallCompliance": {
      "score": 78,
      "status": "partial"
    },
    "frameworkResults": [
      {
        "framework": "GDPR",
        "score": 85,
        "status": "compliant",
        "requirements": {
          "met": 42,
          "partial": 5,
          "notMet": 3,
          "notApplicable": 10
        }
      },
      {
        "framework": "CCPA",
        "score": 72,
        "status": "partial",
        "requirements": {
          "met": 18,
          "partial": 8,
          "notMet": 4,
          "notApplicable": 5
        }
      }
    ],
    "gaps": [
      {
        "id": "gap_001",
        "framework": "CCPA",
        "requirement": "Right to Opt-Out of Sale",
        "section": "1798.120",
        "status": "not_met",
        "severity": "high",
        "remediation": "Add 'Do Not Sell My Personal Information' link",
        "evidence": null
      }
    ],
    "recommendations": [
      {
        "priority": "high",
        "action": "Add opt-out mechanism for data sales",
        "frameworks": ["CCPA"],
        "effort": "medium",
        "deadline": "2024-03-01"
      }
    ]
  }
}
```

---

#### List Compliance Gaps

```http
GET /compliance/gaps
```

**Query Parameters:**
- `framework`: Filter by framework
- `severity`: `critical | high | medium | low`
- `status`: `open | in_progress | resolved`

**Response:**
```json
{
  "success": true,
  "data": {
    "gaps": [
      {
        "id": "gap_001",
        "framework": "CCPA",
        "requirement": "Right to Opt-Out of Sale",
        "severity": "high",
        "status": "open",
        "createdAt": "2024-01-15T10:30:00Z",
        "dueDate": "2024-03-01"
      }
    ],
    "summary": {
      "total": 12,
      "bySeverity": {
        "critical": 1,
        "high": 4,
        "medium": 5,
        "low": 2
      },
      "byStatus": {
        "open": 8,
        "in_progress": 3,
        "resolved": 1
      }
    }
  }
}
```

---

## Authentication

### Bearer Token

```bash
curl -X POST "https://api.adverant.ai/proxy/nexus-law/api/v1/law/documents/analyze" \
  -H "Authorization: Bearer YOUR_NEXUS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentUrl": "https://...", "analysisType": "contract-review"}'
```

### Token Scopes

| Scope | Description |
|-------|-------------|
| `law:documents` | Analyze and manage documents |
| `law:research` | Execute legal research queries |
| `law:citations` | Access citation networks |
| `law:compliance` | Run compliance checks |
| `law:admin` | Administrative operations |

---

## Rate Limits

| Tier | Requests/Minute | Documents/Month | Seats |
|------|-----------------|-----------------|-------|
| Starter | 30 | 100 | 3 |
| Professional | 60 | 1,000 | 15 |
| Enterprise | 120 | Unlimited | Unlimited |

---

## Data Models

### Document Analysis

```typescript
interface DocumentAnalysis {
  analysisId: string;
  status: AnalysisStatus;
  documentUrl: string;
  documentType: DocumentType;
  analysisType: AnalysisType;
  pageCount: number;
  riskAssessment: RiskAssessment;
  summary: string;
  keyFindings: Finding[];
  extractedClauses: Record<string, Clause>;
  parties: Party[];
  keyDates: Record<string, string>;
  financialTerms?: FinancialTerms;
  createdAt: string;
  completedAt?: string;
}

type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';
type DocumentType = 'contract' | 'agreement' | 'nda' | 'lease' | 'policy' | 'other';
type AnalysisType = 'contract-review' | 'due-diligence' | 'compliance' | 'summary';
```

### Risk Assessment

```typescript
interface RiskAssessment {
  overallScore: number;           // 0-100
  riskLevel: RiskLevel;
  factors: RiskFactor[];
}

interface RiskFactor {
  category: string;
  score: number;
  issues: number;
  details?: string;
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
```

### Legal Research Result

```typescript
interface ResearchResult {
  id: string;
  type: SourceType;
  title: string;
  citation: string;
  court?: string;
  date: string;
  relevanceScore: number;
  summary: string;
  keyHoldings?: string[];
  citedBy: number;
  goodLaw: boolean;
  fullTextUrl: string;
}

type SourceType = 'case_law' | 'statute' | 'regulation' | 'secondary';
```

### Citation Network

```typescript
interface CitationNetwork {
  nodes: CitationNode[];
  edges: CitationEdge[];
}

interface CitationNode {
  id: string;
  title: string;
  citation: string;
  court: string;
  date: string;
  type: 'source' | 'cited' | 'citing';
}

interface CitationEdge {
  source: string;
  target: string;
  relationship: 'cites' | 'cited_by';
  treatment: Treatment;
  depth: number;
}

type Treatment = 'followed' | 'distinguished' | 'criticized' |
                 'overruled' | 'questioned' | 'cited';
```

### Compliance Check

```typescript
interface ComplianceCheck {
  checkId: string;
  status: CheckStatus;
  overallCompliance: {
    score: number;
    status: ComplianceStatus;
  };
  frameworkResults: FrameworkResult[];
  gaps: ComplianceGap[];
  recommendations: Recommendation[];
  createdAt: string;
}

interface ComplianceGap {
  id: string;
  framework: string;
  requirement: string;
  section: string;
  status: GapStatus;
  severity: Severity;
  remediation: string;
  evidence?: string;
}

type ComplianceStatus = 'compliant' | 'partial' | 'non_compliant';
type GapStatus = 'open' | 'in_progress' | 'resolved';
```

---

## SDK Integration

### JavaScript/TypeScript SDK

```typescript
import { NexusClient } from '@nexus/sdk';

const nexus = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY,
});

// Analyze a contract
const analysis = await nexus.law.analyzeDocument({
  documentUrl: 'https://storage.example.com/contract.pdf',
  analysisType: 'contract-review',
  options: {
    extractClauses: true,
    riskScoring: true,
    generateSummary: true,
  },
});

console.log(`Risk Score: ${analysis.riskAssessment.overallScore}`);
console.log(`Key Findings: ${analysis.keyFindings.length}`);

// Legal research
const research = await nexus.law.research({
  query: 'employer liability data breach negligence',
  jurisdiction: ['US-CA'],
  sources: ['case_law', 'statutes'],
  limit: 25,
});

for (const result of research.results) {
  console.log(`${result.citation}: ${result.summary}`);
}

// Get citation network
const citations = await nexus.law.getCitations('case_abc123', {
  depth: 3,
  direction: 'both',
});

console.log(`Network: ${citations.citationNetwork.nodes.length} cases`);

// Compliance check
const compliance = await nexus.law.checkCompliance({
  documentUrl: 'https://storage.example.com/policy.pdf',
  frameworks: ['GDPR', 'CCPA'],
});

console.log(`Compliance Score: ${compliance.overallCompliance.score}%`);
console.log(`Gaps: ${compliance.gaps.length}`);
```

### Python SDK

```python
from nexus import NexusClient

client = NexusClient(api_key=os.environ["NEXUS_API_KEY"])

# Analyze contract
analysis = client.law.analyze_document(
    document_url="https://storage.example.com/contract.pdf",
    analysis_type="contract-review",
    options={
        "extract_clauses": True,
        "risk_scoring": True,
        "generate_summary": True
    }
)

print(f"Risk Score: {analysis.risk_assessment.overall_score}")

# Legal research
research = client.law.research(
    query="employer liability data breach negligence",
    jurisdiction=["US-CA"],
    sources=["case_law", "statutes"],
    limit=25
)

for result in research.results:
    print(f"{result.citation}: {result.summary}")

# Compliance check
compliance = client.law.check_compliance(
    document_url="https://storage.example.com/policy.pdf",
    frameworks=["GDPR", "CCPA"]
)

print(f"Compliance Score: {compliance.overall_compliance.score}%")
```

---

## WebSocket API

### Real-time Analysis Updates

```javascript
const ws = new WebSocket('wss://api.adverant.ai/proxy/nexus-law/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_API_TOKEN'
  }));
};

// Subscribe to analysis updates
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'analysis',
  analysisId: 'ana_law123'
}));

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'analysis:progress':
      console.log(`Progress: ${message.progress}%`);
      break;
    case 'analysis:clause_extracted':
      console.log(`Found: ${message.clauseType}`);
      break;
    case 'analysis:risk_found':
      console.log(`Risk: ${message.finding.title}`);
      break;
    case 'analysis:completed':
      console.log(`Analysis complete: ${message.riskScore}`);
      break;
  }
};
```

---

## Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request body |
| `INVALID_DOCUMENT` | 400 | Document cannot be processed |
| `UNSUPPORTED_FORMAT` | 400 | Document format not supported |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid token |
| `INSUFFICIENT_PERMISSIONS` | 403 | Token lacks required scope |
| `DOCUMENT_NOT_FOUND` | 404 | Document analysis not found |
| `CASE_NOT_FOUND` | 404 | Legal case not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `QUOTA_EXCEEDED` | 402 | Monthly document limit reached |
| `ANALYSIS_FAILED` | 500 | Document analysis error |
| `RESEARCH_FAILED` | 500 | Legal research error |

---

## Deployment Requirements

### Container Specifications

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1000m | 2000m |
| Memory | 2Gi | 4Gi |
| Storage | 5Gi | 10Gi |
| Timeout | 10 min | 15 min |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXUS_API_KEY` | Yes | Nexus platform API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GRAPHRAG_URL` | Yes | GraphRAG service URL |
| `MAGEAGENT_URL` | Yes | MageAgent AI service URL |
| `FILEPROCESS_URL` | Yes | File processing service URL |
| `COURTLISTENER_API_KEY` | No | CourtListener API access |
| `LEXISNEXIS_API_KEY` | No | LexisNexis integration |

### Health Checks

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

---

## Supported Document Formats

| Format | Extension | OCR Required |
|--------|-----------|--------------|
| PDF | .pdf | If scanned |
| Word | .docx, .doc | No |
| Rich Text | .rtf | No |
| Plain Text | .txt | No |
| Images | .jpg, .png, .tiff | Yes |

---

## Legal Data Sources

| Source | Coverage | Tier Required |
|--------|----------|---------------|
| CourtListener | US Federal & State | Starter |
| Google Scholar | Case law | Starter |
| LexisNexis | Comprehensive | Enterprise |
| Westlaw | Comprehensive | Enterprise |
| Casetext | AI-enhanced | Professional |

---

## Compliance Frameworks

| Framework | Coverage |
|-----------|----------|
| GDPR | EU data protection |
| CCPA/CPRA | California privacy |
| HIPAA | Healthcare privacy |
| SOX | Financial reporting |
| PCI DSS | Payment card security |
| ISO 27001 | Information security |
| SOC 2 | Service organization controls |

---

## Quotas and Limits

| Limit | Starter | Professional | Enterprise |
|-------|---------|--------------|------------|
| Documents/Month | 100 | 1,000 | Unlimited |
| Research Queries/Day | 50 | 500 | Unlimited |
| Citation Network Depth | 2 | 4 | 5 |
| Max Document Size | 10 MB | 50 MB | 100 MB |
| Max Pages/Document | 100 | 500 | 1,000 |
| Seats | 3 | 15 | Unlimited |
| Storage | 1 GB | 10 GB | 100 GB |

---

## Support

- **Documentation**: [docs.adverant.ai/plugins/nexus-law](https://docs.adverant.ai/plugins/nexus-law)
- **API Status**: [status.adverant.ai](https://status.adverant.ai)
- **Support Email**: legal-support@adverant.ai
- **Discord**: [discord.gg/adverant](https://discord.gg/adverant)
