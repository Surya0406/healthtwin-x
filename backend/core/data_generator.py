"""HealthTwin X Synthetic Data Generator.

Generates 60 daily records per patient persona:
- patient_1: Healthy Athlete (consistent lifestyle, low noise, no drift)
- patient_2: Executive under Stress (normal for days 1-45, gradual HR +14 bpm,
             sleep -2.5 h, systolic BP +12 mmHg, stress rising on days 46-60)
- patient_3: Post-Viral Recovery (high strain early, steady recovery over last 15 days)
"""

from datetime import date, timedelta
import os
from pathlib import Path
import numpy as np
import pandas as pd

DEFAULT_CSV_PATH = Path(__file__).resolve().parent.parent.parent / "shared_contracts" / "sample_patient_data.csv"


def generate_patient_records(
    patient_id: str,
    start_date: date,
    num_days: int = 60,
    seed: int = 42,
) -> list[dict]:
    """Generate 60 daily records for a given patient persona."""
    rng = np.random.default_rng(seed)
    records = []

    for i in range(num_days):
        day_date = start_date + timedelta(days=i)
        date_str = day_date.strftime("%Y-%m-%d")
        day_num = i + 1  # 1 to 60

        if patient_id == "patient_1":
            # Healthy Athlete: stable, low noise, no drift
            hr = 58.0 + rng.normal(0, 1.0)
            spo2 = 98.4 + rng.normal(0, 0.4)
            sbp = 112.0 + rng.normal(0, 1.8)
            sleep = 8.1 + rng.normal(0, 0.2)
            steps = 11800 + rng.normal(0, 450)
            stress = 18.0 + rng.normal(0, 2.0)

        elif patient_id == "patient_2":
            # Executive under Stress: normal for days 1-45;
            # days 46-60: gradual HR +14 bpm, sleep -2.5h, systolic BP +12 mmHg, stress rising
            if day_num <= 45:
                hr = 68.0 + rng.normal(0, 1.6)
                spo2 = 98.0 + rng.normal(0, 0.4)
                sbp = 118.0 + rng.normal(0, 2.0)
                sleep = 7.6 + rng.normal(0, 0.25)
                steps = 8600 + rng.normal(0, 400)
                stress = 26.0 + rng.normal(0, 2.5)
            else:
                progress = (day_num - 45) / 15.0  # 1/15 to 1.0
                hr = 68.0 + (14.0 * progress) + rng.normal(0, 1.4)
                spo2 = 98.0 - (1.6 * progress) + rng.normal(0, 0.4)
                sbp = 118.0 + (12.0 * progress) + rng.normal(0, 2.0)
                sleep = 7.6 - (2.5 * progress) + rng.normal(0, 0.2)
                steps = 8600 - (3200 * progress) + rng.normal(0, 350)
                stress = 26.0 + (48.0 * progress) + rng.normal(0, 3.0)

        elif patient_id == "patient_3":
            # Post-Viral Recovery: high strain early (days 1-45),
            # steady recovery over the last 15 days (days 46-60)
            if day_num <= 45:
                # Early high strain with mild fluctuations
                hr = 83.0 + rng.normal(0, 2.0)
                spo2 = 95.2 + rng.normal(0, 0.5)
                sbp = 130.0 + rng.normal(0, 2.5)
                sleep = 5.6 + rng.normal(0, 0.3)
                steps = 3800 + rng.normal(0, 300)
                stress = 68.0 + rng.normal(0, 3.5)
            else:
                recovery = (day_num - 45) / 15.0  # 1/15 to 1.0
                hr = 83.0 - (19.0 * recovery) + rng.normal(0, 1.5)
                spo2 = 95.2 + (3.0 * recovery) + rng.normal(0, 0.4)
                sbp = 130.0 - (15.0 * recovery) + rng.normal(0, 2.0)
                sleep = 5.6 + (2.3 * recovery) + rng.normal(0, 0.25)
                steps = 3800 + (4600 * recovery) + rng.normal(0, 350)
                stress = 68.0 - (42.0 * recovery) + rng.normal(0, 2.8)
        else:
            raise ValueError(f"Unknown patient_id: {patient_id}")

        # Clip to physiologically plausible limits
        hr_val = int(np.clip(round(hr), 40, 180))
        spo2_val = int(np.clip(round(spo2), 94, 100))
        sbp_val = int(np.clip(round(sbp), 85, 200))
        sleep_val = float(np.clip(round(sleep, 1), 3.0, 14.0))
        steps_val = int(np.clip(round(steps), 500, 30000))
        stress_val = int(np.clip(round(stress), 0, 100))

        records.append({
            "patient_id": patient_id,
            "timestamp": date_str,
            "heart_rate": hr_val,
            "spo2": spo2_val,
            "systolic_bp": sbp_val,
            "sleep_hours": sleep_val,
            "daily_steps": steps_val,
            "stress_index": stress_val,
        })

    return records


def generate_sample_patient_data(output_path: str | Path | None = None) -> pd.DataFrame:
    """Generate 60 rows for patient_1, patient_2, and patient_3 and write to CSV."""
    if output_path is None:
        output_path = DEFAULT_CSV_PATH

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 60 days ending at 2026-03-14: starts at 2026-01-14
    # Day 47 (index 46, day 1 of last 14 days) is 2026-03-01
    start_date = date(2026, 1, 14)
    all_records = []

    personas = [
        ("patient_1", 101),
        ("patient_2", 202),
        ("patient_3", 303),
    ]

    for pid, seed in personas:
        records = generate_patient_records(pid, start_date=start_date, num_days=60, seed=seed)
        all_records.extend(records)

    df = pd.DataFrame(all_records)
    df.to_csv(output_path, index=False)
    print(f"Generated {len(df)} records ({len(personas)} patients x 60 days) to {output_path}")
    return df


if __name__ == "__main__":
    generate_sample_patient_data()
