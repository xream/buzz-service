const Scheduling = require("../bll/scheduling");

const promisify = require('../common/promisify');
const env = process.env.NODE_ENV || "test";
const config = require("../../knexfile")[env];
const knex = require("knex")(config);
const listSuggested = async ctx => {
    try {
        let timeRangeStart = new Date(ctx.query.time_range_start).getTime();

        let res = await knex('student_class_schedule')
            .where('student_class_schedule.start_time', '>=', timeRangeStart)
            .andWhere('student_class_schedule.status', 'booking')
        ;
        let suggestions = Scheduling.makeGroups(res);
        console.log('res = ', res);
        ctx.body = res;
    } catch (error) {
        console.error(error);
        ctx.throw(500, error);
    }
};

function selectClasses() {
    return knex('classes')
        .select('class_id', 'adviser_id', 'start_time', 'end_time', 'status', 'name', 'remark', 'topic', 'room_url', 'exercises');
}

const list = async ctx => {
    ctx.body = await selectClasses();
};

const upsert = async ctx => {
    let {body} = ctx.request;

    let trx = await promisify(knex.transaction);

    try {
        let classIds = [body.class_id];

        let data = {
            adviser_id: body.adviser_id,
            start_time: body.start_time,
            end_time: body.end_time,
            status: body.status,
            name: body.name,
            remark: body.remark,
            topic: body.topic,
            room_url: body.room_url,
            exercises: body.exercises,
        };

        let studentSchedules = body.students.map(studentId => {
            return {
                user_id: studentId,
                class_id: body.class_id,
                start_time: body.start_time,
                end_time: body.end_time,
                status: 'confirmed'
            };
        });

        let companionSchedules = body.companions.map(companionId => {
            return {
                user_id: companionId,
                class_id: body.class_id,
                start_time: body.start_time,
                end_time: body.end_time,
                status: 'confirmed'
            }
        })

        if (body.class_id) {
            await trx('classes')
                .returning('class_id')
                .update(data)
                .where({class_id: body.class_id});

            let originalCompanions = await trx('companion_class_schedule')
                .select('user_id')
                .where({class_id: body.class_id});

            let toBeDeletedCompanionSchedules = originalCompanions.filter(c => companionSchedules.indexOf(c) < 0);

            await trx('companion_class_schedule')
                .where('user_id', 'in', toBeDeletedCompanionSchedules)
                .del();

            // New companionSchedules
            companionSchedules = companionSchedules.filter(s => originalCompanions.indexOf(s.user_id) < 0);

            let originalStudents = await trx('student_class_schedule')
                .select('user_id')
                .where({class_id: body.class_id});

            let toBeDeletedStudentSchedules = originalStudents.filter(s => studentSchedules.indexOf(s) < 0);
            await trx('student_class_schedule')
                .where('user_id', 'in', toBeDeletedStudentSchedules)
                .del();

            // New StudentSchedules
            studentSchedules = studentSchedules.filter(s => originalStudents.indexOf(s.user_id) < 0);
        } else {
            classIds = await trx('classes')
                .returning('class_id')
                .insert(data);
        }

        if (studentSchedules.length) {
            await trx('student_class_schedule')
                .returning('start_time')
                .insert(studentSchedules.map(s => {
                    s.class_id = classIds[0];
                    return s;
                }))
        }

        if (companionSchedules.length) {
            await trx('companion_class_schedule')
                .returning('start_time')
                .insert(companionSchedules.map(s => {
                    s.class_id = classIds[0];
                    return s;
                }))
        }

        await trx.commit();

        ctx.status = 201;
        ctx.set("Location", `${ctx.request.URL}`);
        ctx.body = (await selectClasses().where({class_id: classIds[0]}))[0];
    } catch (error) {
        console.error(error);

        await trx.rollback();
        ctx.status = 500;
        ctx.body = {
            error: "Save class failed!"
        };
    }
}

module.exports = {listSuggested, list, upsert};