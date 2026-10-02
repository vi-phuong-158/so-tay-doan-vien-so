"""Read-only source extraction. Never correct wording, whitespace or answer keys."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import openpyxl


def extract(path):
    workbook = openpyxl.load_workbook(path, data_only=False)
    sheet = workbook.active
    expected = ['STT', 'Nội dung câu hỏi', 'Đáp án đúng', 'Nội dung đáp án A',
                'Nội dung đáp án B', 'Nội dung đáp án C', 'Nội dung đáp án D']
    errors, questions = [], []
    if [sheet.cell(1, col).value for col in range(1, 8)] != expected:
        errors.append({'row': 1, 'error': 'Unexpected source headers'})
    for row in range(2, sheet.max_row + 1):
        values = [sheet.cell(row, col).value for col in range(1, 9)]
        if all(value is None for value in values):
            continue
        number, text, answer, *rest = values
        options = rest[:4]
        if not isinstance(number, int) or isinstance(number, bool) or number not in range(1, 301):
            errors.append({'row': row, 'number': number, 'error': 'Invalid STT'})
        for col, value in enumerate(values[:7], 1):
            if value is None or not str(value).strip() or sheet.cell(row, col).data_type in ('f', 'e'):
                errors.append({'row': row, 'number': number, 'cell': sheet.cell(row, col).coordinate,
                               'error': 'Missing content, formula or Excel error'})
        if answer not in ('A', 'B', 'C', 'D'):
            errors.append({'row': row, 'number': number, 'error': 'Invalid answer'})
        questions.append({'question_number': number, 'question_text': text,
                          'options': dict(zip('ABCD', options)), 'correct_answer': answer,
                          'recognition_level': values[7]})
    numbers = [q['question_number'] for q in questions]
    duplicates = [n for n, count in collections.Counter(numbers).items() if count > 1]
    if len(questions) != 300 or sorted(numbers) != list(range(1, 301)):
        errors.append({'error': 'Expected exactly STT 1–300', 'duplicates': duplicates})
    report = {'excel_rows': len(questions), 'valid_questions': len(questions) if not errors else None,
              'invalid': errors, 'duplicate_question_numbers': duplicates,
              'answer_distribution': dict(sorted(collections.Counter(q['correct_answer'] for q in questions).items())),
              'source_sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
              'notes': ['Câu 103, G104: numeric 1 preserved as option text "1"; not inferred or corrected.']}
    return questions, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not Path(args.source).is_file():
        raise SystemExit('QUIZ_SOURCE_FILE_BLOCKED')
    questions, report = extract(args.source)
    print(json.dumps(report, ensure_ascii=False))
    if report['invalid']:
        raise SystemExit('QUIZ_SOURCE_VALIDATION_BLOCKED')
    Path(args.output).write_text(json.dumps(questions, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
