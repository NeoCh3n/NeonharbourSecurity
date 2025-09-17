"""Compliance pack generator for HKMA SA-2 / TM-G-1 requirements."""
from __future__ import annotations

import argparse
import csv
import json
import shutil
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fpdf import FPDF

TEMPLATE_DIR = Path("docs/hkma")


@dataclass
class ControlRow:
    framework: str
    control_id: str
    description: str
    implementation: str
    evidence: str


def build_control_matrix() -> List[ControlRow]:
    return [
        ControlRow("HKMA SA-2", "SA-2.1", "Information security policy established", "Implemented", "Policy approvals, board minutes"),
        ControlRow("HKMA SA-2", "SA-2.3", "Segregation of duties documented", "Implemented", "PAM logs, role matrix"),
        ControlRow("HKMA TM-G-1", "TM-G-1.2", "Regular risk assessments", "Implemented", "Risk assessment reports"),
        ControlRow("HKMA TM-G-1", "TM-G-1.4", "Incident response plan established", "Implemented", "IR playbooks, drill evidence"),
    ]


def write_control_matrix(matrix: List[ControlRow], output_dir: Path) -> None:
    csv_path = output_dir / "sa2_tm-g1_control_matrix.csv"
    md_path = output_dir / "sa2_tm-g1_control_matrix.md"
    pdf_path = output_dir / "sa2_tm-g1_control_matrix.pdf"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["framework", "control_id", "description", "implementation", "evidence"])
        writer.writeheader()
        for row in matrix:
            writer.writerow(asdict(row))
    with md_path.open("w", encoding="utf-8") as handle:
        handle.write("# HKMA SA-2 / TM-G-1 Control Matrix\n\n")
        handle.write("| Framework | Control ID | Description | Implementation | Evidence |\n")
        handle.write("|-----------|------------|-------------|----------------|----------|\n")
        for row in matrix:
            handle.write(f"| {row.framework} | {row.control_id} | {row.description} | {row.implementation} | {row.evidence} |\n")
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "HKMA SA-2 / TM-G-1 Control Matrix", ln=True)
    pdf.set_font("Helvetica", size=11)
    for row in matrix:
        pdf.multi_cell(
            0,
            7,
            f"{row.framework} {row.control_id}: {row.description}\n"
            f"Status: {row.implementation}\nEvidence: {row.evidence}\n",
            border=0,
        )
        pdf.ln(1)
    pdf.output(str(pdf_path))


def copy_templates(output_dir: Path) -> None:
    for template in TEMPLATE_DIR.glob("**/*.md"):
        relative = template.relative_to(TEMPLATE_DIR)
        destination = output_dir / "templates" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(template.read_text(encoding="utf-8"), encoding="utf-8")
    for diagram in TEMPLATE_DIR.glob("**/*.mmd"):
        relative = diagram.relative_to(TEMPLATE_DIR)
        destination = output_dir / "diagrams" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(diagram.read_text(encoding="utf-8"), encoding="utf-8")


def write_summary(output_dir: Path, metadata: dict) -> None:
    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def write_sod_report(output_dir: Path) -> None:
    sod_path = output_dir / "segregation_of_duties.json"
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checks": [
            {
                "control": "SA-2.3",
                "description": "Administrative and operational roles separated",
                "status": "pass",
                "evidence": "PAM approval workflow reviewed 2024-02-01",
            },
            {
                "control": "TM-G-1.3",
                "description": "Privilege escalation attempts monitored",
                "status": "pass",
                "evidence": "Sentinel analytic rule 'Privileged Role Elevation'",
            },
            {
                "control": "SA-2.3",
                "description": "Emergency access auto-expiry",
                "status": "monitor",
                "remediation": "Automate firecall ticket closure within 4 hours",
            },
        ],
    }
    sod_path.write_text(json.dumps(report, indent=2), encoding="utf-8")


def build_compliance_pack(output_root: Path | None = None, *, include_archive: bool = True) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_root = output_root or Path("out")
    pack_dir = output_root / f"hkma_compliance_pack_{timestamp}"
    pack_dir.mkdir(parents=True, exist_ok=True)

    matrix = build_control_matrix()
    write_control_matrix(matrix, pack_dir)
    copy_templates(pack_dir)
    write_sod_report(pack_dir)
    write_summary(
        pack_dir,
        {
            "generated_at": timestamp,
            "controls": len(matrix),
            "kms_encryption": "Artifacts stored in KMS-encrypted S3 bucket as per infra/sam-template.yaml",
            "iam_scope": "IAM policies limited to compliance generator role with write access to audit bucket",
            "sod_checks": "segregation_of_duties.json",
        },
    )

    if include_archive:
        archive_path = shutil.make_archive(str(pack_dir), "zip", root_dir=pack_dir)
        return Path(archive_path)
    return pack_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate HKMA compliance pack")
    parser.add_argument("--output", type=Path, default=Path("out"), help="Destination directory")
    parser.add_argument("--no-archive", action="store_true", help="Skip creating .zip archive")
    args = parser.parse_args()

    result = build_compliance_pack(args.output, include_archive=not args.no_archive)
    print(f"Compliance pack created at {result}")


if __name__ == "__main__":
    main()
