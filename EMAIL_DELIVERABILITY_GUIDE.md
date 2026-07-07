# Email Deliverability Guide - Prevent Emails Going to Spam

## Overview

Emails going to spam is a common issue. This guide covers the technical configurations needed to ensure your emails land in the inbox.

---

## What We've Already Fixed ✅

### 1. Email Template Improvements
- ✅ Added proper HTML structure with DOCTYPE and meta tags
- ✅ Added plain text version (required by spam filters)
- ✅ Professional design with table-based layout
- ✅ Clear unsubscribe mechanism
- ✅ Proper footer with copyright
- ✅ No spammy words or excessive formatting

### 2. Email Headers
- ✅ Added priority headers (X-Priority, Importance)
- ✅ Added custom mailer identifier
- ✅ Added auto-response suppression
- ✅ Added list-unsubscribe header
- ✅ Added tracking categories for SendGrid

### 3. Subject Line
- ✅ Changed from "Verify your Sweepro email - OTP" to "Your Sweepro Verification Code: 123***"
- ✅ More specific and less generic
- ✅ Includes partial code for user identification

---

## Critical DNS Configurations (Required)

To prevent emails from going to spam, you MUST configure these DNS records for your domain `sweepro.in`:

### 1. SPF (Sender Policy Framework)

SPF tells email providers which servers are allowed to send emails from your domain.

**Add this TXT record to your DNS:**

```
Type: TXT
Name: @
Value: v=spf1 include:sendgrid.net include:_spf.google.com ~all
```

**Explanation:**
- `v=spf1` - SPF version
- `include:sendgrid.net` - Allow SendGrid to send emails
- `include:_spf.google.com` - Allow Gmail (if you use Gmail SMTP)
- `~all` - Soft fail (emails from other servers may be marked as spam but not rejected)

**If you only use SendGrid:**
```
v=spf1 include:sendgrid.net ~all
```

**If you only use Gmail SMTP:**
```
v=spf1 include:_spf.google.com ~all
```

---

### 2. DKIM (DomainKeys Identified Mail)

DKIM adds a cryptographic signature to your emails to prove they haven't been tampered with.

**For SendGrid:**
1. Log in to SendGrid dashboard
2. Go to Settings → Sender Authentication
3. Click "Authenticate Your Domain"
4. Add your domain: `sweepro.in`
5. SendGrid will provide you with 3 CNAME records to add to your DNS

**Example CNAME records (actual values will be provided by SendGrid):**
```
Type: CNAME
Name: sendgrid._domainkey
Value: u123456789.wl123.sendgrid.net

Type: CNAME  
Name: s1._domainkey
Value: s1.domainkey.u123456789.wl123.sendgrid.net

Type: CNAME
Name: s2._domainkey
Value: s2.domainkey.u123456789.wl123.sendgrid.net
```

**For Gmail SMTP:**
Gmail handles DKIM automatically if you're using `@gmail.com` addresses. For custom domains with Google Workspace, configure DKIM in Google Admin Console.

---

### 3. DMARC (Domain-based Message Authentication, Reporting & Conformance)

DMARC tells email providers what to do with emails that fail SPF/DKIM checks.

**Add this TXT record to your DNS:**

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@sweepro.in; ruf=mailto:dmarc@sweepro.in; sp=none; pct=100
```

**Explanation:**
- `v=DMARC1` - DMARC version
- `p=quarantine` - Quarantine emails that fail (send to spam, not reject)
- `rua=mailto:dmarc@sweepro.in` - Send aggregate reports to this email
- `ruf=mailto:dmarc@sweepro.in` - Send forensic reports to this email
- `sp=none` - No policy for subdomains
- `pct=100` - Apply policy to 100% of emails

**Start with `p=none` for monitoring:**
```
v=DMARC1; p=none; rua=mailto:dmarc@sweepro.in; ruf=mailto:dmarc@sweepro.in; sp=none; pct=100
```

After 1-2 weeks of monitoring, change to `p=quarantine`, then eventually `p=reject`.

---

## Additional Recommendations

### 1. Warm Up Your Email Domain

If you're sending from a new domain or new IP address:

**Week 1:** Send 50-100 emails per day
**Week 2:** Send 200-300 emails per day
**Week 3:** Send 500-800 emails per day
**Week 4:** Send 1000+ emails per day

Gradually increase volume to build reputation.

---

### 2. Monitor Email Reputation

Use these tools to check your domain's email reputation:

- **Google Postmaster Tools**: https://postmaster.google.com/
- **Microsoft SNDS**: https://postmaster.live.com/snds/
- **Sender Score**: https://www.senderscore.org/
- **Mail-Tester**: https://www.mail-tester.com/

---

### 3. Check FROM Email Address

Ensure your `FROM_EMAIL` environment variable uses a domain you control:

**Good:**
```
FROM_EMAIL=noreply@sweepro.in
FROM_EMAIL=verify@sweepro.in
FROM_EMAIL=support@sweepro.in
```

**Avoid:**
```
FROM_EMAIL=noreply@gmail.com  # If not verified
FROM_EMAIL=admin@sweepro.in   # Use subdomain for system emails
```

---

### 4. Reply-To Address

Set a reply-to address for user convenience:

```javascript
// In EmailService.js
replyTo: 'support@sweepro.in'
```

---

### 5. Unsubscribe Mechanism

Already implemented in the email headers. Ensure you have a working unsubscribe endpoint or email handler.

---

## Testing Your Configuration

### 1. Test SPF/DKIM/DMARC

Use these tools to verify your DNS records:

- **MXToolbox**: https://mxtoolbox.com/
- **DMARC Analyzer**: https://dmarcanalyzer.com/
- **Kitterman SPF**: http://www.kitterman.com/spf/validate.html

### 2. Test Email Deliverability

Send a test email to:
- `check-auth@verifier.port25.com` - Returns detailed authentication results
- `mail-test@mxtoolbox.com` - Tests deliverability

### 3. Use Mail-Tester

1. Go to https://www.mail-tester.com/
2. Send a test email to the address provided
3. Get a score and recommendations

---

## Common Issues & Solutions

### Issue: Emails still going to spam after DNS setup

**Solution:**
1. Wait 24-48 hours for DNS propagation
2. Check DNS records are correct
3. Verify SendGrid domain authentication is verified
4. Check your domain's reputation score

### Issue: Gmail marks emails as spam

**Solution:**
1. Add SPF/DKIM/DMARC records
2. Ask users to mark emails as "Not Spam"
3. Use a consistent FROM address
4. Avoid spammy words in subject lines

### Issue: Outlook/Hotmail marks emails as spam

**Solution:**
1. Register with Microsoft SNDS
2. Add SPF/DKIM/DMARC records
3. Use proper HTML formatting
4. Include plain text version

### Issue: SendGrid emails bouncing

**Solution:**
1. Verify your domain in SendGrid
2. Check your sender reputation
3. Ensure FROM email matches authenticated domain
4. Check SendGrid suppression list

---

## Quick Setup Checklist

- [ ] Add SPF TXT record to DNS
- [ ] Add DKIM CNAME records (from SendGrid)
- [ ] Add DMARC TXT record to DNS
- [ ] Wait 24-48 hours for DNS propagation
- [ ] Verify DNS records using MXToolbox
- [ ] Test with Mail-Tester
- [ ] Monitor email reputation weekly
- [ ] Set up Google Postmaster Tools
- [ ] Set up Microsoft SNDS
- [ ] Warm up email domain if new

---

## Environment Variables Review

Ensure these are set correctly in your `.env`:

```bash
# Email Configuration
FROM_EMAIL=noreply@sweepro.in
FROM_NAME=Sweepro
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@sweepro.in
SMTP_PASS=your-app-password
SMTP_SECURE=false

# SendGrid (if using)
SENDGRID_API_KEY=SG.your-api-key-here
```

---

## Monitoring & Maintenance

### Weekly Tasks
- Check email deliverability rates
- Review DMARC reports
- Monitor bounce rates
- Check spam complaint rates

### Monthly Tasks
- Review sender reputation scores
- Update DNS records if needed
- Review email templates for spam triggers
- Check for blacklisting

---

## Emergency: If Emails Are Blocked

If your domain gets blacklisted:

1. **Identify the blacklist** - Use https://mxtoolbox.com/blacklists.aspx
2. **Request removal** - Follow the blacklist's removal process
3. **Fix the issue** - Address what caused the blacklisting
4. **Monitor** - Watch for recurrence

---

## Support Resources

- **SendGrid Documentation**: https://docs.sendgrid.com/
- **Google Postmaster**: https://support.google.com/mail/answer/6254652
- **DMARC.org**: https://dmarc.org/
- **Return Path**: https://www.validity.com/

---

**Last Updated**: 2026-07-07  
**Status**: Implementation Required
