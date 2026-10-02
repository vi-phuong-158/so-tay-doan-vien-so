"""Generate an idempotent, bank-scoped seed from validated canonical source JSON."""
import json
import sys
import uuid
from pathlib import Path

BANK_ID = '7c620b81-6dc6-4a57-9908-3a1f68652a00'
TOPIC_ID = '7c620b81-6dc6-4a57-9908-3a1f68652a01'


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def build(questions):
    assert len(questions) == 300
    assert sorted(q['question_number'] for q in questions) == list(range(1, 301))
    assert all(q['correct_answer'] in 'ABCD' and set(q['options']) == set('ABCD')
               and all(v is not None and str(v).strip() for v in q['options'].values())
               and isinstance(q['question_text'], str) and q['question_text'].strip() for q in questions)
    sql = ['begin;', f"select pg_advisory_xact_lock(hashtext('{BANK_ID}:seed'));",
           f"insert into public.learning_topics(id,title,status,visibility_level) values('{TOPIC_ID}','Trắc nghiệm Nghị quyết','DRAFT','INTERNAL_YOUTH') on conflict(id) do nothing;",
           f"insert into public.quizzes(id,topic_id,title,bank_code,pass_score,time_limit_minutes,max_attempts,shuffle_questions,shuffle_options,status) values('{BANK_ID}','{TOPIC_ID}','Trắc nghiệm Nghị quyết','NQ_300',0,20,null,true,true,'DRAFT') on conflict(id) do update set title=excluded.title,bank_code=excluded.bank_code,time_limit_minutes=20,max_attempts=null,shuffle_questions=true,shuffle_options=true;"]
    for q in questions:
        number = q['question_number']
        question_id = str(uuid.uuid5(uuid.UUID(BANK_ID), str(number)))
        sql.append(f"insert into public.quiz_questions(id,quiz_id,question_number,question_type,question_text,points,sort_order) values('{question_id}','{BANK_ID}',{number},'SINGLE',{literal(q['question_text'])},1,{number}) on conflict(quiz_id,question_number) where question_number is not null do update set question_text=excluded.question_text;")
        for index, label in enumerate('ABCD', 1):
            option_id = str(uuid.uuid5(uuid.UUID(question_id), label))
            correct = 'true' if q['correct_answer'] == label else 'false'
            sql.append(f"insert into public.quiz_options(id,question_id,source_label,option_text,is_correct,sort_order) values('{option_id}',(select id from public.quiz_questions where quiz_id='{BANK_ID}' and question_number={number}),'{label}',{literal(q['options'][label])},{correct},{index}) on conflict(question_id,source_label) where source_label is not null do update set option_text=excluded.option_text,is_correct=excluded.is_correct;")
    sql += [f"do $$ begin if (select count(*) from public.quiz_questions where quiz_id='{BANK_ID}')<>300 then raise exception 'QUIZ_BANK_INCOMPLETE'; end if; end $$;", 'commit;']
    return '\n'.join(sql) + '\n'


if __name__ == '__main__':
    questions = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    Path(sys.argv[2]).write_text(build(questions), encoding='utf-8')
