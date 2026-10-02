import type { Template } from '../types.ts'
import { arabicConference } from './arabicConference.ts'
import { conference } from './conference.ts'
import { meetup } from './meetup.ts'
import { offsite } from './offsite.ts'
import { workshop } from './workshop.ts'

/** The templates that ship with the app. All content is generic placeholder text. */
export const BUILTIN_TEMPLATES: readonly Template[] = [conference, meetup, workshop, offsite, arabicConference]
