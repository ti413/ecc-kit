# 📋 TEMPLATE GENÉRICO: AGENTS.md Para Qualquer Projeto

## 📌 Como Usar Este Template

Este é um template genérico que você pode adaptar para **qualquer projeto**:
- ✅ Minhas Metas PWA
- ✅ Clinic Bot (n8n + Chatwoot)
- ✅ Aprisco Church App
- ✅ Projetos futuros

**Instruções:**
1. Copie este arquivo como `AGENTS.md` em seu projeto
2. Procure por `[CUSTOMIZE]` 
3. Substitua pelos seus valores
4. Delete as seções que não se aplicam

---

## OPÇÃO 1: Para PWA/Frontend (Metas, Aprisco App)

```markdown
# [CUSTOMIZE: Seu App Name] — Everything Claude Code Configuration

## 📋 Project Context

**Application**: [CUSTOMIZE: App Name]  
**Purpose**: [CUSTOMIZE: O que faz - ex: Personal goals tracking, Church community app]  
**Stack**: [CUSTOMIZE: Tech stack - ex: Vanilla HTML/JS, React Native, Vue]  
**Database**: [CUSTOMIZE: Supabase project ID ou outro]  
**Auth**: [CUSTOMIZE: Google OAuth, JWT, etc]  
**Users**: [CUSTOMIZE: Target users]  

## 🎯 Active Agents (ENABLED)

### 1. **security-reviewer** ⚠️ CRITICAL
**Purpose**: [CUSTOMIZE: Security concerns for your app]
**Validates**:
- [CUSTOMIZE: Key 1 - ex: Tokens stored securely]
- [CUSTOMIZE: Key 2 - ex: Admin routes protected]
- [CUSTOMIZE: Key 3 - ex: No PII in logs]

**Triggers On**:
- Authentication code changes
- [CUSTOMIZE: Your specific triggers]

---

### 2. **database-reviewer** 🗄️ HIGH PRIORITY
**Purpose**: [CUSTOMIZE: Database stability concerns]
**Validates**:
- [CUSTOMIZE: Schema validations needed]
- [CUSTOMIZE: Constraints important for you]
- [CUSTOMIZE: Specific validations]

---

### 3. **code-quality-reviewer** 💻 MEDIUM PRIORITY
**Purpose**: [CUSTOMIZE: Code quality for your stack]
**Validates**:
- [CUSTOMIZE: Memory leak prevention - relevant to your tech?]
- [CUSTOMIZE: Performance patterns you care about]
- [CUSTOMIZE: Code style standards]

---

### 4. **[CUSTOMIZE: Your Custom Agent]**
**Purpose**: [CUSTOMIZE: Something specific to your project]
**Validates**:
- [CUSTOMIZE: What this agent should check]

---

## 🔴 Disabled Agents

- [LIST agents you DON'T need for your project]

---

## 🛡️ Critical Rules for [CUSTOMIZE: App Name]

### Rule 1: [CUSTOMIZE: Your first rule]
```javascript
// [CUSTOMIZE: Good example]
// ✅ ALLOWED
const example = "good code"

// [CUSTOMIZE: Bad example]
// ❌ FORBIDDEN
const bad = "bad code"
```

### Rule 2: [CUSTOMIZE: Second rule]
[Your rule here]

---

## 📊 Expected Outcomes

### Security
- ✅ [CUSTOMIZE: Your security goal]
- ✅ [CUSTOMIZE: Your security goal]

### Performance
- ✅ [CUSTOMIZE: Your performance goal]

### Reliability
- ✅ [CUSTOMIZE: Your reliability goal]

---

[End of template]
```

---

## OPÇÃO 2: Para Automação/Bot (Clinic Bot)

```markdown
# [CUSTOMIZE: Clinic Bot/Automation] — Everything Claude Code Configuration

## 📋 Project Context

**Application**: [CUSTOMIZE: Bot Name]  
**Purpose**: [CUSTOMIZE: What it does - ex: WhatsApp automation for clinic]  
**Stack**: [CUSTOMIZE: n8n, Evolution API, Chatwoot, Python, etc]  
**Infrastructure**: [CUSTOMIZE: VPS location, Docker setup]  
**Environments**:
- 🟢 Production: [CUSTOMIZE: Your prod URL]
- 🔵 Staging: [CUSTOMIZE: Your staging URL]

**Database**: [CUSTOMIZE: Supabase project or other]  
**Authentication**: [CUSTOMIZE: Evolution API keys, JWT, etc]  
**Criticality**: [CUSTOMIZE: Healthcare data, financial data, etc]  

## 🎯 Active Agents

### 1. **api-reviewer** 🔌 CRITICAL
**Purpose**: WhatsApp integration stability
**Validates**:
- [CUSTOMIZE: Evolution API calls correct]
- [CUSTOMIZE: Webhook signatures verified]
- [CUSTOMIZE: Message routing proper]
- [CUSTOMIZE: Error handling robust]

---

### 2. **security-reviewer** ⚠️ CRITICAL
**Purpose**: API key and data protection
**Validates**:
- [CUSTOMIZE: API keys not in code]
- [CUSTOMIZE: Webhook validation]
- [CUSTOMIZE: Data encryption at rest]
- [CUSTOMIZE: No sensitive data in logs]

---

### 3. **webhook-validator** (Custom Agent)
**Purpose**: Webhook reliability
**Validates**:
- [CUSTOMIZE: Webhook format correct]
- [CUSTOMIZE: Retry logic working]
- [CUSTOMIZE: Timeout handling proper]

---

### 4. **integration-tester** 🔄
**Purpose**: Staging ↔ Production consistency
**Validates**:
- [CUSTOMIZE: API configs synchronized]
- [CUSTOMIZE: Webhook URLs match environment]
- [CUSTOMIZE: No prod data leaking to staging]

---

## 🔴 Disabled Agents

- typescript-reviewer (not used in automation)
- [LIST others you don't use]

---

## 🛡️ Critical Rules

### Rule 1: API Keys Management
```javascript
// ✅ ALLOWED (environment variables)
const apiKey = process.env.EVOLUTION_API_KEY

// ❌ FORBIDDEN (hardcoded)
const apiKey = "evo_12345"
```

### Rule 2: [CUSTOMIZE: Your specific rule]
[Your rule here]

---

## 🚨 Webhook Loop Prevention
[CUSTOMIZE: Add specific rules for your webhook setup]

---

## 📊 Expected Outcomes

### Reliability
- ✅ Zero webhook failures
- ✅ Proper error handling
- ✅ [CUSTOMIZE: Your goal]

### Security
- ✅ API keys protected
- ✅ [CUSTOMIZE: Your goal]

---

[End of template]
```

---

## OPÇÃO 3: Para Aplicativo Híbrido (Aprisco App)

```markdown
# [CUSTOMIZE: Aprisco Church App] — Everything Claude Code Configuration

## 📋 Project Context

**Application**: [CUSTOMIZE: App Name]  
**Purpose**: [CUSTOMIZE: Mobile app for what?]  
**Stack**: [CUSTOMIZE: React Native, Expo, Supabase, etc]  
**Database**: [CUSTOMIZE: Supabase project ID]  
**Auth**: [CUSTOMIZE: Google, Email, Phone]  
**Target Users**: [CUSTOMIZE: Church members, admins, etc]  
**Data Type**: [CUSTOMIZE: Private/public/sensitive]  

## 🎯 Active Agents

### 1. **security-reviewer** ⚠️ CRITICAL
**Purpose**: User data protection
**Validates**:
- [CUSTOMIZE: Authentication flow secure]
- [CUSTOMIZE: User data encrypted]
- [CUSTOMIZE: Admin functions gated]
- [CUSTOMIZE: No sensitive data in logs/storage]

---

### 2. **typescript-reviewer** 💻 HIGH PRIORITY
**Purpose**: Type safety and code quality
**Validates**:
- [CUSTOMIZE: Component props typed]
- [CUSTOMIZE: Supabase types correct]
- [CUSTOMIZE: Navigation types safe]

---

### 3. **database-reviewer** 🗄️
**Purpose**: Schema and data consistency
**Validates**:
- [CUSTOMIZE: RLS policies correct]
- [CUSTOMIZE: User isolation enforced]
- [CUSTOMIZE: Data migrations safe]

---

### 4. **mobile-reviewer** 📱 (Custom)
**Purpose**: Mobile-specific best practices
**Validates**:
- [CUSTOMIZE: Performance on slow networks]
- [CUSTOMIZE: Offline capability working]
- [CUSTOMIZE: Battery usage optimized]

---

## 🛡️ Critical Rules

### Rule 1: User Privacy
```javascript
// ✅ ALLOWED
const userPrayers = await fetchUserData(currentUser.id)

// ❌ FORBIDDEN
const allPrayers = await fetchAllData() // No user filter!
```

### Rule 2: [CUSTOMIZE: Your rule]
[Your rule here]

---

## 📊 Expected Outcomes

### Security
- ✅ User data protected
- ✅ [CUSTOMIZE: Your goal]

### Performance
- ✅ App loads < 2 seconds
- ✅ [CUSTOMIZE: Your goal]

---

[End of template]
```

---

## 🎯 Passo a Passo Para Usar Este Template

### 1. Escolha Sua Opção
```
[ ] Opção 1: PWA/Frontend (Metas, Aprisco)
[ ] Opção 2: Bot/Automação (Clinic Bot)
[ ] Opção 3: Aplicativo Híbrido
```

### 2. Copie o Código Correto
```bash
# Abrir este arquivo
cat AGENTS_TEMPLATE.md

# Copiar seção correspondente para novo arquivo
nano AGENTS.md
# Cole a opção escolhida
```

### 3. Procure por [CUSTOMIZE]
```bash
grep -n "CUSTOMIZE" AGENTS.md

# Exemplo output:
# 5: **Application**: [CUSTOMIZE: App Name]
# 7: **Purpose**: [CUSTOMIZE: O que faz]
```

### 4. Edite Cada [CUSTOMIZE]
```bash
# Opção A: Editor
nano AGENTS.md
# Procure por [CUSTOMIZE] e edite

# Opção B: Sed (mass replace)
sed -i 's/\[CUSTOMIZE: App Name\]/Minhas Metas/g' AGENTS.md
sed -i 's/\[CUSTOMIZE: Tech stack\]/Vanilla HTML\/JS, Supabase/g' AGENTS.md
```

### 5. Delete Seções Não Usadas
```bash
# Se não usar um agent, delete a seção
# Exemplo: Para PWA, pode deletar "webhook-validator"

# Se não tiver staging, delete a seção:
# - 🔵 Staging: [CUSTOMIZE: Your staging URL]
```

### 6. Commit
```bash
git add AGENTS.md
git commit -m "feat: customize AGENTS.md for this project"
git push
```

---

## 📝 Variáveis Comuns Para Substituir

### Para Qualquer Projeto
```
[CUSTOMIZE: App Name] → Nome do seu app
[CUSTOMIZE: Your project]
[CUSTOMIZE: Tech stack]
[CUSTOMIZE: Your security goal]
[CUSTOMIZE: Your performance goal]
```

### Para Metas PWA
```
[CUSTOMIZE: App Name] → Minhas Metas
[CUSTOMIZE: Tech stack] → Vanilla HTML/JS, Supabase, PWA
[CUSTOMIZE: Auth] → Google OAuth + sessionStorage
```

### Para Clinic Bot
```
[CUSTOMIZE: App Name] → Clinic Bot
[CUSTOMIZE: Tech stack] → n8n, Evolution API, Chatwoot, Supabase
[CUSTOMIZE: Auth] → Evolution API keys
```

### Para Aprisco App
```
[CUSTOMIZE: App Name] → Aprisco Church App
[CUSTOMIZE: Tech stack] → React Native, Expo, Supabase
[CUSTOMIZE: Auth] → Google OAuth + Firebase
```

---

## 🔄 Reutilizar Entre Projetos

Uma vez que você customize para um projeto, pode reusar para outros:

```bash
# Copiar AGENTS.md existente
cp ~/metas/AGENTS.md ~/clinic-bot/AGENTS_base.md

# Abrir e adaptar para novo projeto
nano ~/clinic-bot/AGENTS.md
# Mudar Application, Stack, etc.
# Keep agents structure similar
```

---

## ✅ Checklist de Conclusão

Para cada projeto:

- [ ] Escolheu opção correta (1, 2 ou 3)
- [ ] Copiou template
- [ ] Substituiu todos os [CUSTOMIZE]
- [ ] Deletou seções não aplicáveis
- [ ] Arquivo válido markdown (sem erros)
- [ ] Commit feito

---

## 🎁 Bônus: Generators Rápidos

### Generate AGENTS.md para Novo Projeto

```bash
#!/bin/bash
# Salve como: generate-agents.sh

PROJECT_NAME="$1"
STACK="$2"

cat > AGENTS.md << EOF
# $PROJECT_NAME — Everything Claude Code Configuration

## 📋 Project Context

**Application**: $PROJECT_NAME
**Stack**: $STACK

## 🎯 Active Agents

### 1. **security-reviewer** ⚠️ CRITICAL
**Purpose**: Security validation

### 2. **database-reviewer** 🗄️
**Purpose**: Database integrity

EOF

echo "✅ AGENTS.md created for $PROJECT_NAME"
```

**Usar:**
```bash
bash generate-agents.sh "Clinic Bot" "n8n, Evolution, Chatwoot"
```

---

## 📞 Se Precisar de Ajuda

1. Qual projeto? (Metas, Clinic Bot, Aprisco, novo?)
2. Qual stack? (PWA, Bot, Mobile, outro?)
3. Qual agent não tem certeza? (security, database, api, etc?)

Com essas infos consigo customizar rapidinho! 🚀

---

**Salve este template. Use em todos seus projetos.** 📁
