"""HealthTwin X Clinical Data Generator.

Generates 90 daily records per patient persona across 12 diverse clinical archetypes:
1. patient_1: Endurance Athlete (high aerobic capacity, stable vagal dominance)
2. patient_2: Corporate Autonomic Strain (days 1-45 normal, days 46-90 gradual drift)
3. patient_3: Post-Viral Recovery (early strain days 1-35, steady 55-day recovery)
4. patient_4: Overtraining Burnout (high steps, severe sleep deficit, autonomic collapse)
5. patient_5: Early Respiratory Infection (subclinical SpO2 dip 98.5% -> 94.8% days 60-75)
6. patient_6: Pre-Hypertensive Sedentary Drift (progressive SBP 122 -> 142 mmHg)
7. patient_7: Circadian Disruption (shift worker with 7-day sleep variance & stress spikes)
8. patient_8: Senior Citizen - Hypertensive Cardiovascular (age-adjusted baseline, SBP 136)
9. patient_9: Senior Citizen - Frailty & Autonomic Dysregulation (low mobility, blunted recovery)
10. patient_10: Metabolic Syndrome Drift (declining steps, elevated nighttime HR)
11. patient_11: Lifestyle Recovery Cohort (high strain days 1-30, rehabilitation days 31-90)
12. patient_12: Healthy Sedentary Baseline (low activity, high homeostasis, zero drift)
"""

from datetime import date, timedelta
import json
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd

DEFAULT_CSV_PATH = Path(__file__).resolve().parent.parent.parent / "shared_contracts" / "sample_patient_data.csv"
METADATA_JSON_PATH = Path(__file__).resolve().parent.parent.parent / "shared_contracts" / "patient_metadata.json"


def generate_patient_records(
    patient_id: str,
    start_date: date,
    num_days: int = 90,
    seed: int = 42,
) -> list[dict[str, Any]]:
    """Generate 90 daily records for a given patient persona."""
    # Seed keyed by patient_id for reproducibility
    seed_offset = int(patient_id.replace("patient_", "") or "1") * 100 + seed
    rng = np.random.default_rng(seed_offset)
    records: list[dict[str, Any]] = []

    for i in range(num_days):
        day_date = start_date + timedelta(days=i)
        date_str = day_date.strftime("%Y-%m-%d")
        day_num = i + 1

        if patient_id == "patient_1":
            # Endurance Athlete: very stable, low resting HR, high steps, high sleep
            hr = 52.0 + rng.normal(0, 1.0)
            spo2 = 98.6 + rng.normal(0, 0.3)
            sbp = 108.0 + rng.normal(0, 1.5)
            sleep = 8.4 + rng.normal(0, 0.2)
            steps = 13800 + rng.normal(0, 500)
            stress = 16.0 + rng.normal(0, 1.8)

        elif patient_id == "patient_2":
            # Corporate Autonomic Strain: normal for days 1-45; days 46-90 progressive drift
            if day_num <= 45:
                hr = 66.0 + rng.normal(0, 1.4)
                spo2 = 98.2 + rng.normal(0, 0.3)
                sbp = 118.0 + rng.normal(0, 1.8)
                sleep = 7.7 + rng.normal(0, 0.25)
                steps = 8800 + rng.normal(0, 400)
                stress = 24.0 + rng.normal(0, 2.2)
            else:
                prog = (day_num - 45) / 45.0
                hr = 66.0 + (18.0 * prog) + rng.normal(0, 1.5)
                spo2 = 98.2 - (1.4 * prog) + rng.normal(0, 0.3)
                sbp = 118.0 + (16.0 * prog) + rng.normal(0, 2.0)
                sleep = 7.7 - (2.6 * prog) + rng.normal(0, 0.2)
                steps = 8800 - (3800 * prog) + rng.normal(0, 350)
                stress = 24.0 + (54.0 * prog) + rng.normal(0, 3.0)

        elif patient_id == "patient_3":
            # Post-Viral Recovery: strain days 1-35, steady recovery days 36-90
            if day_num <= 35:
                hr = 83.0 + rng.normal(0, 2.0)
                spo2 = 95.5 + rng.normal(0, 0.5)
                sbp = 128.0 + rng.normal(0, 2.2)
                sleep = 5.8 + rng.normal(0, 0.3)
                steps = 3600 + rng.normal(0, 300)
                stress = 66.0 + rng.normal(0, 3.2)
            else:
                rec = (day_num - 35) / 55.0
                hr = 83.0 - (21.0 * rec) + rng.normal(0, 1.3)
                spo2 = 95.5 + (2.9 * rec) + rng.normal(0, 0.3)
                sbp = 128.0 - (15.0 * rec) + rng.normal(0, 1.8)
                sleep = 5.8 + (2.4 * rec) + rng.normal(0, 0.2)
                steps = 3600 + (5200 * rec) + rng.normal(0, 350)
                stress = 66.0 - (44.0 * rec) + rng.normal(0, 2.5)

        elif patient_id == "patient_4":
            # Overtraining Burnout: massive steps, but sleep collapse & autonomic failure
            steps_base = 15500 + rng.normal(0, 600)
            if day_num <= 30:
                hr = 58.0 + rng.normal(0, 1.2)
                spo2 = 98.4 + rng.normal(0, 0.3)
                sbp = 114.0 + rng.normal(0, 1.8)
                sleep = 7.2 + rng.normal(0, 0.3)
                steps = steps_base
                stress = 32.0 + rng.normal(0, 2.5)
            else:
                strain = (day_num - 30) / 60.0
                hr = 58.0 + (19.0 * strain) + rng.normal(0, 1.8)
                spo2 = 98.4 - (1.0 * strain) + rng.normal(0, 0.3)
                sbp = 114.0 + (14.0 * strain) + rng.normal(0, 2.0)
                sleep = max(4.0, 7.2 - (2.4 * strain) + rng.normal(0, 0.25))
                steps = max(8000, steps_base - (3500 * strain))
                stress = min(96.0, 32.0 + (52.0 * strain) + rng.normal(0, 3.0))

        elif patient_id == "patient_5":
            # Early Respiratory Infection: subclinical SpO2 dip on days 60-75
            hr_base = 65.0 + rng.normal(0, 1.2)
            spo2_base = 98.6 + rng.normal(0, 0.25)
            sbp_base = 115.0 + rng.normal(0, 1.5)
            sleep_base = 7.8 + rng.normal(0, 0.2)
            steps_base = 9200 + rng.normal(0, 400)
            stress_base = 22.0 + rng.normal(0, 2.0)

            if 60 <= day_num <= 75:
                inf_prog = np.sin(((day_num - 60) / 15.0) * np.pi)
                hr = hr_base + (12.0 * inf_prog)
                spo2 = spo2_base - (3.8 * inf_prog)  # subclinical dip to ~94.8%
                sbp = sbp_base + (6.0 * inf_prog)
                sleep = sleep_base - (1.2 * inf_prog)
                steps = steps_base - (3500 * inf_prog)
                stress = stress_base + (35.0 * inf_prog)
            elif day_num > 75:
                # Post-infection convalescence
                rec_prog = min(1.0, (day_num - 75) / 15.0)
                hr = hr_base + 3.0 * (1 - rec_prog)
                spo2 = spo2_base
                sbp = sbp_base
                sleep = sleep_base
                steps = steps_base
                stress = stress_base
            else:
                hr, spo2, sbp, sleep, steps, stress = hr_base, spo2_base, sbp_base, sleep_base, steps_base, stress_base

        elif patient_id == "patient_6":
            # Pre-Hypertensive Sedentary Drift: low steps, SBP creeping 122 -> 142 mmHg
            prog = day_num / 90.0
            hr = 70.0 + (11.0 * prog) + rng.normal(0, 1.4)
            spo2 = 97.8 - (0.8 * prog) + rng.normal(0, 0.3)
            sbp = 122.0 + (21.0 * prog) + rng.normal(0, 2.2)  # vascular remodeling
            sleep = 7.1 - (1.2 * prog) + rng.normal(0, 0.25)
            steps = 4200 - (1400 * prog) + rng.normal(0, 280)
            stress = 35.0 + (25.0 * prog) + rng.normal(0, 2.5)

        elif patient_id == "patient_7":
            # Circadian Disruption: 7-day shift worker with high variance in sleep and stress
            cycle = (day_num % 7) / 7.0
            is_night_shift = (day_num % 14) >= 7
            hr = 68.0 + (8.0 if is_night_shift else 0.0) + rng.normal(0, 2.0)
            spo2 = 97.9 + rng.normal(0, 0.4)
            sbp = 119.0 + (8.0 if is_night_shift else 0.0) + rng.normal(0, 2.2)
            sleep = (4.8 if is_night_shift else 8.2) + rng.normal(0, 0.4)
            steps = 7400 + rng.normal(0, 500)
            stress = (68.0 if is_night_shift else 28.0) + rng.normal(0, 3.5)

        elif patient_id == "patient_8":
            # Senior Citizen - Hypertensive Cardiovascular (age-adjusted profile, SBP 136)
            prog = max(0.0, (day_num - 50) / 40.0)
            hr = 73.0 + (5.0 * prog) + rng.normal(0, 1.4)
            spo2 = 96.5 - (0.6 * prog) + rng.normal(0, 0.35)
            sbp = 135.0 + (12.0 * prog) + rng.normal(0, 2.5)  # age-related arterial stiffness
            sleep = 6.8 - (0.6 * prog) + rng.normal(0, 0.25)
            steps = 5400 - (1200 * prog) + rng.normal(0, 300)
            stress = 28.0 + (18.0 * prog) + rng.normal(0, 2.2)

        elif patient_id == "patient_9":
            # Senior Citizen - Frailty & Autonomic Dysregulation (low mobility, slow recovery)
            prog = max(0.0, (day_num - 40) / 50.0)
            hr = 76.0 + (6.0 * prog) + rng.normal(0, 1.5)
            spo2 = 96.0 - (0.8 * prog) + rng.normal(0, 0.4)
            sbp = 126.0 + (7.0 * prog) + rng.normal(0, 2.4)
            sleep = 6.4 - (0.8 * prog) + rng.normal(0, 0.3)
            steps = 2800 - (800 * prog) + rng.normal(0, 200)
            stress = 42.0 + (22.0 * prog) + rng.normal(0, 2.8)

        elif patient_id == "patient_10":
            # Metabolic Syndrome Drift: steps collapse 6,500 -> 2,800, nighttime HR elevation
            prog = day_num / 90.0
            hr = 72.0 + (12.0 * prog) + rng.normal(0, 1.6)
            spo2 = 97.4 - (1.2 * prog) + rng.normal(0, 0.35)
            sbp = 126.0 + (15.0 * prog) + rng.normal(0, 2.3)
            sleep = 6.9 - (1.6 * prog) + rng.normal(0, 0.3)
            steps = 6500 - (3700 * prog) + rng.normal(0, 320)
            stress = 45.0 + (28.0 * prog) + rng.normal(0, 2.8)

        elif patient_id == "patient_11":
            # Lifestyle Recovery Cohort: high strain days 1-30, intentional recovery days 31-90
            if day_num <= 30:
                hr = 81.0 + rng.normal(0, 1.8)
                spo2 = 96.8 + rng.normal(0, 0.4)
                sbp = 132.0 + rng.normal(0, 2.2)
                sleep = 5.9 + rng.normal(0, 0.3)
                steps = 4400 + rng.normal(0, 350)
                stress = 62.0 + rng.normal(0, 3.0)
            else:
                rec = (day_num - 30) / 60.0
                hr = 81.0 - (20.0 * rec) + rng.normal(0, 1.2)
                spo2 = 96.8 + (1.8 * rec) + rng.normal(0, 0.25)
                sbp = 132.0 - (18.0 * rec) + rng.normal(0, 1.6)
                sleep = 5.9 + (2.4 * rec) + rng.normal(0, 0.2)
                steps = 4400 + (6200 * rec) + rng.normal(0, 400)
                stress = 62.0 - (44.0 * rec) + rng.normal(0, 2.2)

        elif patient_id == "patient_12":
            # Healthy Sedentary Baseline: sedentary (~5000 steps), but low stress & zero drift
            hr = 64.0 + rng.normal(0, 1.1)
            spo2 = 98.4 + rng.normal(0, 0.3)
            sbp = 116.0 + rng.normal(0, 1.6)
            sleep = 7.9 + rng.normal(0, 0.2)
            steps = 5100 + rng.normal(0, 320)
            stress = 19.0 + rng.normal(0, 1.8)

        else:
            hr = 70.0 + rng.normal(0, 2.0)
            spo2 = 98.0 + rng.normal(0, 0.4)
            sbp = 120.0 + rng.normal(0, 2.0)
            sleep = 7.5 + rng.normal(0, 0.3)
            steps = 8000 + rng.normal(0, 400)
            stress = 30.0 + rng.normal(0, 3.0)

        records.append({
            "patient_id": patient_id,
            "timestamp": date_str,
            "heart_rate": int(np.clip(round(hr), 40, 190)),
            "spo2": int(np.clip(round(spo2), 92, 100)),
            "systolic_bp": int(np.clip(round(sbp), 85, 210)),
            "sleep_hours": float(np.clip(round(sleep, 1), 3.0, 14.0)),
            "daily_steps": int(np.clip(round(steps), 500, 35000)),
            "stress_index": int(np.clip(round(stress), 0, 100)),
        })

    return records


def generate_sample_patient_data(csv_path: Path = DEFAULT_CSV_PATH) -> pd.DataFrame:
    """Generate 90-day dataset across all 12 diverse patient personas."""
    # Start date 90 days prior to today
    start_date = date.today() - timedelta(days=90)
    all_records: list[dict[str, Any]] = []

    patient_ids = [f"patient_{i}" for i in range(1, 13)]

    for pid in patient_ids:
        records = generate_patient_records(pid, start_date=start_date, num_days=90)
        all_records.extend(records)

    df = pd.DataFrame(all_records)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False)
    return df


if __name__ == "__main__":
    df = generate_sample_patient_data()
    print(f"Generated {len(df)} rows across {df['patient_id'].nunique()} patient personas at {DEFAULT_CSV_PATH}")
