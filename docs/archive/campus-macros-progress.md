# Campus Macros — Build Progress Summary

## What We Built
A full SaaS web app called **Campus Macros** — a meal planning app for college students that generates personalized meal plans with accurate macros, full recipes, and a grocery list based on weekly budget, fitness goal, and dietary restrictions.

**Live URL:** https://campusmacros.com
**Vercel URL:** https://macro-planner-ten.vercel.app
**GitHub:** https://github.com/tshibles/macro-planner
**Local project folder:** ~/macro-planner

---

## Tech Stack
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend/DB:** Supabase (auth + profiles table)
- **Payments:** Stripe (live mode, pending 2-3 day review)
- **Hosting:** Vercel
- **Domain:** Namecheap → campusmacros.com
- **Emails:** Loops (set up, not yet configured)
- **Analytics:** PostHog (not yet added)
- **Nutrition data:** USDA FoodData Central API (key: 0oV74c15CjK2XUg4BVBhWJCQEuBanU6AD12ZJW54)

---

## Pricing Tiers
| Plan | Length | Price |
|---|---|---|
| Free Trial | 1 week | $0 |
| Starter | 1 month | $10 |
| Committed | 3 months | $20 |
| Serious | 6 months | $30 |
| Full Year | 12 months | $40 |

---

## App Features (Built & Live)
- 80-meal library: 20 breakfasts, 20 lunches, 20 dinners, 20 snacks
- Each meal has full ingredients, step-by-step recipe, USDA macro data
- Dietary filtering: none, vegetarian, vegan, dairy-free, gluten-free, halal, kosher
- Fitness goal scoring: muscle gain, fat loss, general health, endurance
- Meal rotation logic: no repeats within a week, rotates across plan length
- Recipe modal: click any meal to see full recipe + macro breakdown + cost per serving
- Free trial: Day 1 visible, Days 2-7 blurred with Stripe paywall
- Auth wall: users must sign up before generating any plan
- Free trial tracked in Supabase — one per account

---

## Infrastructure Setup Complete
- Homebrew installed on Mac
- Node.js v24.16.0 via nvm
- Git 2.54.0
- GitHub account: tshibles
- Cursor installed and logged in
- Claude Code v2.1.148 installed and logged in (Claude Pro, Sonnet 4.6)
- Supabase project: hroiemqpsetbewhslpnk
- Vercel project connected to GitHub, auto-deploys on push
- Namecheap domain: campusmacros.com (DNS pointed to Vercel)
- Stripe: live account created, Campus Macros business, pending 2-3 day review

---

## Environment Variables
### In ~/macro-planner/.env.local and Vercel:
- `STRIPE_SECRET_KEY` = sk_live_... (live key)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = pk_live_... (live key)
- `NEXT_PUBLIC_SUPABASE_URL` = https://hroiemqpsetbewhslpnk.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (full anon key)
- `USDA_API_KEY` = 0oV74c15CjK2XUg4BVBhWJCQEuBanU6AD12ZJW54 (add this if not already in .env.local)

---

## Supabase Database
- `profiles` table created with:
  - `id` (uuid, references auth.users)
  - `free_trial_used` (boolean, default false)
  - `created_at` (timestamptz)
- Row Level Security enabled with policies for read/insert/update
- Trigger: auto-creates profile row on new user signup
- Email auth: enabled
- Email confirmation: should be ON
- Google OAuth: NOT YET SET UP

---

## What's In Progress Right Now
### Google OAuth Setup (partially done)
- Google Cloud Console: project "MacroPlanner" (ID: macroplanner-497216) being created
- Next steps:
  1. Finish creating the Google Cloud project
  2. Go to APIs & Services → OAuth consent screen → External → Create
     - App name: Macro Planner
     - Support email: campusmacros@gmail.com
     - Add yourself as test user → Save
  3. Go to APIs & Services → Credentials → + Create Credentials → OAuth client ID
     - Type: Web application
     - Name: Macro Planner
     - Authorized JavaScript origins: https://campusmacros.com
     - Authorized redirect URIs: https://hroiemqpsetbewhslpnk.supabase.co/auth/v1/callback
     - Click Create → copy Client ID and Client Secret
  4. Go to Supabase → Authentication → Providers → Google → toggle ON → paste Client ID and Secret → Save

### Auth fixes (code already built by Claude Code, just needs Google OAuth):
- ✅ Confirm password field added to signup form
- ✅ "Check your email" screen after signup (needs email confirmation ON in Supabase)
- ⏳ Google sign in (needs Google Cloud OAuth credentials)

---

## What's Left To Do
1. **Finish Google OAuth** (in progress above)
2. **Push auth fixes to GitHub/Vercel:**
   ```bash
   cd ~/macro-planner && git add . && git commit -m "fix auth: confirm password, email confirmation, google oauth" && git push
   ```
3. **Wait for Stripe review** (2-3 days) — payments will go live automatically
4. **Build Reddit karma** — comment in r/Fitness, r/EatCheapAndHealthy, r/gainit for 1 week before posting
5. **Record YouTube Short** — screen record app flow: homepage → form → meal plan → recipe modal
6. **Add PostHog analytics** — track signups, plan generations, conversions
7. **Enable Google OAuth** fully
8. **Add Loops welcome email** — trigger on signup

---

## How To Resume Building
Open Terminal and run:
```bash
cd ~/macro-planner && claude
```
This resumes Claude Code in your project. Always push changes with:
```bash
git add . && git commit -m "description" && git push
```
Vercel auto-deploys on every push to main.

---

## Key Commands Reference
```bash
# Start dev server locally
cd ~/macro-planner && npm run dev
# Visit http://localhost:3000

# Open Claude Code
cd ~/macro-planner && claude

# Push to GitHub (triggers Vercel deploy)
git add . && git commit -m "your message" && git push

# Edit environment variables
nano ~/macro-planner/.env.local
```

---

## Reddit Launch Strategy (when karma is built)
Post on: r/EatCheapAndHealthy, r/gainit, r/Fitness, r/collegelifestyle, r/mealprep
Title: "Built a free meal planner for college students that actually accounts for your budget and macros"
Body: Lead with value, mention free trial, link campusmacros.com, offer to take feedback

---

## Revenue Target
$500–$1,000/month
- At $10 (Starter): 50 sales
- At $20 (Committed): 25 sales  
- Mixed: ~30 sales average
