import urllib.request
import json

def run_report():
    req = urllib.request.Request("http://127.0.0.1:8000/api/counterfactual-summary")
    with urllib.request.urlopen(req) as resp:
        cf = json.loads(resp.read().decode())

    total_fired = cf["total_guardrails_fired"]
    total_prevented = cf["total_additional_contacts_prevented"]
    total_compliance = cf["total_compliance_risks_avoided"]
    total_shielded = cf["total_amount_shielded_from_unwanted_contact"]

    print("================================================================================")
    print("             RECOUP COUNTERFACTUAL & GUARDRAIL IMPACT AUDIT REPORT")
    print("================================================================================")
    print(f"Total Guardrails Fired:                     {total_fired}")
    print(f"Total Additional Contacts Prevented:       {total_prevented}")
    print(f"Total Compliance / AML Violations Avoided: {total_compliance}")
    print(f"Total Capital Shielded from Harassment:     ₹{total_shielded:,.2f}")

    print("\n--- PER-GUARDRAIL-TYPE BREAKDOWN ---")
    for k, v in cf["breakdown_by_guardrail_type"].items():
        cnt = v["count_fired"]
        prev = v["additional_contacts_prevented"]
        c_risk = v["compliance_risks_avoided"]
        amt = v["amount_shielded"]
        naive = v["naive_action"]
        reason = v["reasoning"]
        example = v["example_reasoning"]
        print(f"\n[Guardrail: {k.upper()}]")
        print(f"  • Count Fired:               {cnt}")
        print(f"  • Contacts Prevented:        {prev}")
        print(f"  • Compliance Risks Avoided:  {c_risk}")
        print(f"  • Capital Shielded:          ₹{amt:,.2f}")
        print(f"  • Naive Baseline Action:     \"{naive}\"")
        print(f"  • Policy Reasoning:          {reason}")
        print(f"  • Real Example Record:       {example}")

    print("\n--- 3 DETAILED REAL RECORD EXAMPLES ---")
    samples = cf["sample_records"]
    for i, s in enumerate(samples[:3], 1):
        rec_type = s["record_type"].upper()
        rec_id = s["record_id"]
        g_type = s["guardrail_type"]
        r_amt = s["record_amount"]
        n_act = s["naive_action"]
        c_prev = s["additional_contacts_prevented"]
        c_risk = s["compliance_risk"]
        r_text = s["reasoning"]
        print(f"\nExample #{i}: [{rec_type}] {rec_id}")
        print(f"  • Guardrail Triggered:       {g_type}")
        print(f"  • Record Amount:             ₹{r_amt:,.2f}")
        print(f"  • Naive Agent Action:        \"{n_act}\"")
        print(f"  • Contacts Prevented:        {c_prev}")
        print(f"  • Compliance Risk Avoided:   {c_risk}")
        print(f"  • Autonomous Reasoning:      {r_text}")

if __name__ == "__main__":
    run_report()
