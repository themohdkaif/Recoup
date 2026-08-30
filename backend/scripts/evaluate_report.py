import urllib.request
import json

def generate_report():
    req = urllib.request.Request("http://127.0.0.1:8000/api/diagnosis-accuracy/all")
    with urllib.request.urlopen(req) as resp:
        all_eval = json.loads(resp.read().decode())

    tot_eval = all_eval["total_evaluated"]
    tot_corr = all_eval["total_correct"]
    ov_acc = all_eval["overall_accuracy_pct"]
    gem_acc = all_eval["gemini_overall_accuracy_pct"]
    fb_acc = all_eval["fallback_overall_accuracy_pct"]
    m_corr = all_eval["confidence_stats"]["mean_correct"]
    m_inc = all_eval["confidence_stats"]["mean_incorrect"]
    corr_holds = all_eval["confidence_stats"]["correlation_holds"]

    print("================================================================================")
    print("             RECOUP DIAGNOSTIC ACCURACY & PRECISION AUDIT REPORT")
    print("================================================================================")
    print(f"Total Diagnoses Evaluated Across System: {tot_eval}")
    print(f"Total Correct Diagnoses:                {tot_corr}")
    print(f"Overall Multi-Flow Accuracy:            {ov_acc}%")
    print(f"Gemini LLM Classifier Accuracy:         {gem_acc}%")
    print(f"Fallback Rules Heuristic Accuracy:      {fb_acc}%")
    print(f"Confidence Stats: Mean Correct={m_corr}, Mean Incorrect={m_inc}")
    print(f"Confidence Calibration Holds:           {corr_holds}")

    for flow_name in ["payment", "mandate", "receivable"]:
        rep = all_eval["flow_reports"][flow_name]
        f_tot = rep["total_evaluated"]
        f_corr = rep["correct_count"]
        f_acc = rep["overall_accuracy_pct"]
        g_acc = rep["gemini_breakdown"]["accuracy_pct"]
        g_c = rep["gemini_breakdown"]["correct"]
        g_t = rep["gemini_breakdown"]["total"]
        fb_a = rep["fallback_breakdown"]["accuracy_pct"]
        fb_c = rep["fallback_breakdown"]["correct"]
        fb_t = rep["fallback_breakdown"]["total"]
        f_mc = rep["confidence_stats"]["mean_correct"]
        f_mi = rep["confidence_stats"]["mean_incorrect"]
        
        print("\n--------------------------------------------------------------------------------")
        print(f"FLOW: {flow_name.upper()} ({f_tot} Records)")
        print(f"  • Overall Flow Accuracy: {f_acc}% ({f_corr}/{f_tot})")
        print(f"  • Gemini Breakdown:     {g_acc}% ({g_c}/{g_t})")
        print(f"  • Fallback Breakdown:   {fb_a}% ({fb_c}/{fb_t})")
        print(f"  • Mean Confidence:      Correct={f_mc}, Incorrect={f_mi}")
        
        print("\n  Per-Class Precision, Recall, & F1 Metrics:")
        print(f"    {'Taxonomy Label':<26} | {'Precision':>10} | {'Recall':>8} | {'F1-Score':>9} | {'Support':>7}")
        print("    " + "-"*72)
        for cm in rep["per_class_metrics"]:
            lbl = cm["label"]
            p = cm["precision_pct"]
            r = cm["recall_pct"]
            f1 = cm["f1_score_pct"]
            sup = cm["support"]
            print(f"    {lbl:26} | {p:>9.1f}% | {r:>7.1f}% | {f1:>8.1f}% | {sup:>7}")
            
        print("\n  Full Confusion Matrix (Rows = Actual Ground Truth, Columns = Predicted):")
        header_cols = "  ".join([f"{c[:10]:>10}" for c in rep["classes"]])
        col_title = "Actual \\ Pred"
        print(f"    {col_title:<26} | {header_cols}")
        print("    " + "-"*(28 + 12*len(rep["classes"])))
        for act in rep["classes"]:
            row_str = "  ".join([f"{rep['confusion_matrix'][act].get(p, 0):>10}" for p in rep["classes"]])
            print(f"    {act:<26} | {row_str}")

if __name__ == "__main__":
    generate_report()
