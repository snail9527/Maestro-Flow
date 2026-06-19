# Security Audit Guide

> This document introduces Maestro's security audit capabilities, including OWASP Top 10, STRIDE threat modeling, and supply chain analysis.

## Overview

The `security-audit` command provides systematic security auditing covering:

- **OWASP Top 10**: Web application security risks
- **Dependency Supply Chain**: Third-party library security analysis
- **Secrets Detection**: Hardcoded credentials and sensitive information
- **CI/CD Pipeline**: Continuous integration/deployment security configuration
- **STRIDE Threat Modeling**: Systematic threat analysis (deep level)
- **Git History**: Security issues in commit history (deep level)

## Audit Depth

| Level | OWASP | Dependencies | Secrets | CI/CD | STRIDE | Git History |
|-------|-------|-------------|---------|-------|--------|-------------|
| quick | ✓ | ✓ | — | — | — | — |
| standard | ✓ | ✓ | ✓ | ✓ | — | — |
| deep | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### quick Level

Quick scan for daily development checks:

```bash
/security-audit quick
```

- Scans OWASP Top 10 common vulnerabilities
- Checks dependencies for known vulnerabilities
- Execution time: 5-10 minutes

### standard Level

Standard scan for pre-release checks:

```bash
/security-audit standard
```

- All quick level checks
- Detects hardcoded secrets and credentials
- Reviews CI/CD pipeline configuration
- Execution time: 15-30 minutes

### deep Level

Deep scan for security audits:

```bash
/security-audit deep
```

- All standard level checks
- STRIDE threat modeling
- Git history security analysis
- Execution time: 30-60 minutes

## Usage Examples

```bash
# Default quick scan
/security-audit

# Specify depth
/security-audit standard

# Limit scan scope
/security-audit deep --scope src/auth

# Combined usage
/security-audit standard --scope src/api
```

## OWASP Top 10 Coverage

The audit checks the following OWASP Top 10 risks:

| # | Risk | Check Content |
|---|------|---------------|
| A01 | Broken Access Control | Permission checks, role validation, resource access control |
| A02 | Cryptographic Failures | Encryption algorithms, key management, data protection |
| A03 | Injection | SQL/NoSQL/OS/LDAP injection prevention |
| A04 | Insecure Design | Security design patterns, threat modeling |
| A05 | Security Misconfiguration | Default configurations, error handling, security headers |
| A06 | Vulnerable Components | Dependency versions, known vulnerabilities |
| A07 | Authentication Failures | Authentication mechanisms, session management, password policies |
| A08 | Data Integrity Failures | Data validation, serialization, CI/CD pipelines |
| A09 | Logging Failures | Logging, monitoring, alerting |
| A10 | SSRF | Server-side request forgery prevention |

## STRIDE Threat Modeling

Deep level includes STRIDE threat modeling:

| Threat Type | Description | Checkpoints |
|-------------|-------------|-------------|
| **S**poofing | Identity forgery | Authentication mechanisms, token validation, certificate pinning |
| **T**ampering | Data tampering | Integrity checks, signature validation, input validation |
| **R**epudiation | Denial of actions | Audit logs, digital signatures, timestamps |
| **I**nformation Disclosure | Information leakage | Data encryption, error handling, log sanitization |
| **D**enial of Service | Service disruption | Rate limiting, resource limits, timeout configuration |
| **E**levation of Privilege | Privilege escalation | Least privilege principle, role validation, sandbox isolation |

## Supply Chain Analysis

The audit checks dependency supply chain security:

1. **Known Vulnerabilities**: Checks npm audit / pip audit / cargo audit, etc.
2. **Version Locking**: Verifies package-lock.json / requirements.txt, etc.
3. **License Compliance**: Checks dependency license compatibility
4. **Maintenance Status**: Identifies long-term unmaintained dependencies
5. **Transitive Dependencies**: Analyzes indirect dependency security risks

## Output Report

After audit completion, a structured report is generated:

```
.security-audit/
├── summary.md          # Executive summary
├── owasp-top10.md      # OWASP check results
├── dependencies.md     # Dependency analysis
├── secrets.md          # Secrets detection results (standard+)
├── cicd.md             # CI/CD review results (standard+)
├── stride.md           # STRIDE analysis (deep)
├── git-history.md      # Git history analysis (deep)
└── recommendations.md  # Remediation recommendations
```

## Workflow Integration

### Ralph Integration

```json
{
  "steps": [
    {
      "index": 0,
      "skill": "security-audit",
      "args": "standard --scope src/api",
      "stage": "verify"
    }
  ]
}
```

### Quality-Review Integration

```bash
# Execute security audit first
/security-audit standard --scope src/auth

# Then execute code review (including security dimension)
/quality-review 1 --dimensions security
```

## Best Practices

1. **Regular Audits**: Execute standard level audit at each milestone end
2. **Pre-release Checks**: Execute deep level audit before release
3. **Focus Scope**: Use `--scope` to limit scan directory for efficiency
4. **Fix Priority**: Fix critical and high severity issues first
5. **Continuous Improvement**: Include audit results in spec system for tracking

## FAQ

### Q: Scan time is too long?

Use `--scope` to limit scan scope, or reduce audit depth:

```bash
/security-audit quick --scope src/api
```

### Q: How to ignore specific warnings?

Configure ignore rules in `.workflow/config.json`:

```json
{
  "security": {
    "ignore": [
      "CVE-2023-XXXXX",
      "hardcoded-secret-in-test"
    ]
  }
}
```

### Q: How to integrate with CI/CD?

Add security audit step in CI/CD pipeline:

```yaml
- name: Security Audit
  run: maestro delegate "security-audit quick" --mode analysis
```

---

## Related Documentation

- [Command Reference](../COMMANDS-CARD-REFERENCE.md) — Quick reference for all commands
- [Quality Pipeline Guide](./quality-pipeline-guide.en.md) — Quality assurance workflow
- [Hooks Guide](./hooks-guide.en.md) — Workflow hooks configuration
