// Copied from: https://github.com/rveciana/svg-path-properties

import {parsePath} from '../parse-path';
import {makeArc} from './arc';
import {makeCubic, makeQuadratic} from './bezier';
import {makeLinearPosition} from './linear';
import type {Instruction, Point, PointArray, Properties} from './types';

export const constructFromInstructions = (instructions: Instruction[]) => {
	let length = 0;
	const partial_lengths: number[] = [];
	const functions: (null | Properties)[] = [];
	let initial_point: null | Point = null;

	let cur: PointArray = [0, 0];
	let prev_point: PointArray = [0, 0];
	let curve:
		| ReturnType<typeof makeCubic>
		| ReturnType<typeof makeQuadratic>
		| undefined;
	let ringStart: PointArray = [0, 0];

	const segments: Instruction[][] = [];

	for (let i = 0; i < instructions.length; i++) {
		const instruction = instructions[i];

		if (
			instruction.type !== 'm' &&
			instruction.type !== 'M' &&
			segments.length > 0
		) {
			segments[segments.length - 1].push(instruction);
		}

		// moveTo
		if (instruction.type === 'M') {
			cur = [instruction.x, instruction.y];
			ringStart = [cur[0], cur[1]];
			segments.push([instruction]);
			functions.push(null);
			if (i === 0) {
				initial_point = {x: instruction.x, y: instruction.y};
			}
		} else if (instruction.type === 'm') {
			cur = [instruction.dx + cur[0], instruction.dy + cur[1]];
			ringStart = [cur[0], cur[1]];
			segments.push([{type: 'M', x: cur[0], y: cur[1]}]);
			functions.push(null);
			// lineTo
		} else if (instruction.type === 'L') {
			length += Math.sqrt(
				(cur[0] - instruction.x) ** 2 + (cur[1] - instruction.y) ** 2,
			);
			functions.push(
				makeLinearPosition({
					x0: cur[0],
					x1: instruction.x,
					y0: cur[1],
					y1: instruction.y,
				}),
			);
			cur = [instruction.x, instruction.y];
		} else if (instruction.type === 'l') {
			length += Math.sqrt(instruction.dx ** 2 + instruction.dy ** 2);
			functions.push(
				makeLinearPosition({
					x0: cur[0],
					x1: instruction.dx + cur[0],
					y0: cur[1],
					y1: instruction.dy + cur[1],
				}),
			);
			cur = [instruction.dx + cur[0], instruction.dy + cur[1]];
		} else if (instruction.type === 'H') {
			length += Math.abs(cur[0] - instruction.x);
			functions.push(
				makeLinearPosition({
					x0: cur[0],
					x1: instruction.x,
					y0: cur[1],
					y1: cur[1],
				}),
			);
			cur[0] = instruction.x;
		} else if (instruction.type === 'h') {
			length += Math.abs(instruction.dx);
			functions.push(
				makeLinearPosition({
					x0: cur[0],
					x1: cur[0] + instruction.dx,
					y0: cur[1],
					y1: cur[1],
				}),
			);
			cur[0] = instruction.dx + cur[0];
		} else if (instruction.type === 'V') {
			length += Math.abs(cur[1] - instruction.y);
			functions.push(
				makeLinearPosition({
					x0: cur[0],
					x1: cur[0],
					y0: cur[1],
					y1: instruction.y,
				}),
			);
			cur[1] = instruction.y;
		} else if (instruction.type === 'v') {
			length += Math.abs(instruction.dy);
			functions.push(
				makeLinearPosition({
					x0: cur[0],
					x1: cur[0],
					y0: cur[1],
					y1: cur[1] + instruction.dy,
				}),
			);
			cur[1] = instruction.dy + cur[1];
			// Close path
		} else if (instruction.type === 'Z') {
			length += Math.sqrt(
				(ringStart[0] - cur[0]) ** 2 + (ringStart[1] - cur[1]) ** 2,
			);
			functions.push(
				makeLinearPosition({
					x0: cur[0],
					x1: ringStart[0],
					y0: cur[1],
					y1: ringStart[1],
				}),
			);
			cur = [ringStart[0], ringStart[1]];
			// Cubic Bezier curves
		} else if (instruction.type === 'C') {
			curve = makeCubic({
				startX: cur[0],
				startY: cur[1],
				cp1x: instruction.cp1x,
				cp1y: instruction.cp1y,
				cp2x: instruction.cp2x,
				cp2y: instruction.cp2y,
				x: instruction.x,
				y: instruction.y,
			});
			length += curve.getTotalLength();
			cur = [instruction.x, instruction.y];
			functions.push(curve);
		} else if (instruction.type === 'c') {
			curve = makeCubic({
				startX: cur[0],
				startY: cur[1],
				cp1x: cur[0] + instruction.cp1dx,
				cp1y: cur[1] + instruction.cp1dy,
				cp2x: cur[0] + instruction.cp2dx,
				cp2y: cur[1] + instruction.cp2dy,
				x: cur[0] + instruction.dx,
				y: cur[1] + instruction.dy,
			});
			if (curve.getTotalLength() > 0) {
				length += curve.getTotalLength();
				functions.push(curve);
				cur = [instruction.dx + cur[0], instruction.dy + cur[1]];
			} else {
				functions.push(
					makeLinearPosition({x0: cur[0], x1: cur[0], y0: cur[1], y1: cur[1]}),
				);
			}
		} else if (instruction.type === 'S') {
			const prev = instructions[i - 1];
			const prevWasCurve =
				prev.type === 'C' ||
				prev.type === 'c' ||
				prev.type === 'S' ||
				prev.type === 's';
			if (i > 0 && prevWasCurve) {
				if (curve) {
					const c = curve.getC();
					curve = makeCubic({
						startX: cur[0],
						startY: cur[1],
						cp1x: 2 * cur[0] - c.x,
						cp1y: 2 * cur[1] - c.y,
						cp2x: instruction.cpx,
						cp2y: instruction.cpy,
						x: instruction.x,
						y: instruction.y,
					});
				}
			} else {
				curve = makeCubic({
					startX: cur[0],
					startY: cur[1],
					cp1x: cur[0],
					cp1y: cur[1],
					cp2x: instruction.cpx,
					cp2y: instruction.cpy,
					x: instruction.x,
					y: instruction.y,
				});
			}

			if (curve) {
				length += curve.getTotalLength();
				cur = [instruction.x, instruction.y];
				functions.push(curve);
			}
		} else if (instruction.type === 's') {
			const prev = instructions[i - 1];
			const prevWasCurve =
				prev.type === 'C' ||
				prev.type === 'c' ||
				prev.type === 'S' ||
				prev.type === 's';

			if (i > 0 && prevWasCurve) {
				if (curve) {
					const c = curve.getC();
					const d = curve.getD();
					curve = makeCubic({
						startX: cur[0],
						startY: cur[1],
						cp1x: cur[0] + d.x - c.x,
						cp1y: cur[1] + d.y - c.y,
						cp2x: cur[0] + instruction.cpdx,
						cp2y: cur[1] + instruction.cpdy,
						x: cur[0] + instruction.dx,
						y: cur[1] + instruction.dy,
					});
				}
			} else {
				curve = makeCubic({
					startX: cur[0],
					startY: cur[1],
					cp1x: cur[0],
					cp1y: cur[1],
					cp2x: cur[0] + instruction.cpdx,
					cp2y: cur[1] + instruction.cpdy,
					x: cur[0] + instruction.dx,
					y: cur[1] + instruction.dy,
				});
			}

			if (curve) {
				length += curve.getTotalLength();
				cur = [instruction.dx + cur[0], instruction.dy + cur[1]];
				functions.push(curve);
			}
		}
		// Quadratic Bezier curves
		else if (instruction.type === 'Q') {
			if (cur[0] === instruction.cpx && cur[1] === instruction.cpy) {
				const linearCurve = makeLinearPosition({
					x0: instruction.cpx,
					x1: instruction.x,
					y0: instruction.cpy,
					y1: instruction.y,
				});
				length += linearCurve.getTotalLength();
				functions.push(linearCurve);
			} else {
				curve = makeQuadratic({
					startX: cur[0],
					startY: cur[1],
					cpx: instruction.cpx,
					cpy: instruction.cpy,
					x: instruction.x,
					y: instruction.y,
				});
				length += curve.getTotalLength();
				functions.push(curve);
			}

			cur = [instruction.x, instruction.y];
			prev_point = [instruction.cpx, instruction.cpy];
		} else if (instruction.type === 'q') {
			if (instruction.cpdx === 0 && instruction.cpdy === 0) {
				const linearCurve = makeLinearPosition({
					x0: cur[0] + instruction.cpdx,
					x1: cur[0] + instruction.cpdy,
					y0: cur[1] + instruction.dx,
					y1: cur[1] + instruction.dy,
				});
				length += linearCurve.getTotalLength();
				functions.push(linearCurve);
			} else {
				curve = makeQuadratic({
					startX: cur[0],
					startY: cur[1],
					cpx: cur[0] + instruction.cpdx,
					cpy: cur[1] + instruction.cpdy,
					x: cur[0] + instruction.dx,
					y: cur[1] + instruction.dy,
				});
				length += curve.getTotalLength();
				functions.push(curve);
			}

			prev_point = [cur[0] + instruction.cpdx, cur[1] + instruction.cpdy];
			cur = [instruction.dx + cur[0], instruction.dy + cur[1]];
		} else if (instruction.type === 'T') {
			const prev = instructions[i - 1];
			const prevWasQ =
				prev.type === 'Q' ||
				prev.type === 'q' ||
				prev.type === 'T' ||
				prev.type === 't';
			if (i > 0 && prevWasQ) {
				curve = makeQuadratic({
					startX: cur[0],
					startY: cur[1],
					cpx: 2 * cur[0] - prev_point[0],
					cpy: 2 * cur[1] - prev_point[1],
					x: instruction.x,
					y: instruction.y,
				});
				functions.push(curve);
				length += curve.getTotalLength();
			} else {
				const linearCurve = makeLinearPosition({
					x0: cur[0],
					x1: instruction.x,
					y0: cur[1],
					y1: instruction.y,
				});
				functions.push(linearCurve);
				length += linearCurve.getTotalLength();
			}

			prev_point = [2 * cur[0] - prev_point[0], 2 * cur[1] - prev_point[1]];
			cur = [instruction.x, instruction.y];
		} else if (instruction.type === 't') {
			const prev = instructions[i - 1];
			const prevWasQ =
				prev.type === 'Q' ||
				prev.type === 'q' ||
				prev.type === 'T' ||
				prev.type === 't';
			if (i > 0 && prevWasQ) {
				curve = makeQuadratic({
					startX: cur[0],
					startY: cur[1],
					cpx: 2 * cur[0] - prev_point[0],
					cpy: 2 * cur[1] - prev_point[1],
					x: cur[0] + instruction.dx,
					y: cur[1] + instruction.dy,
				});
				length += curve.getTotalLength();
				functions.push(curve);
			} else {
				const linearCurve = makeLinearPosition({
					x0: cur[0],
					x1: cur[0] + instruction.dx,
					y0: cur[1],
					y1: cur[1] + instruction.dy,
				});
				length += linearCurve.getTotalLength();
				functions.push(linearCurve);
			}

			prev_point = [2 * cur[0] - prev_point[0], 2 * cur[1] - prev_point[1]];
			cur = [instruction.dx + cur[0], instruction.dy + cur[1]];
		} else if (instruction.type === 'A') {
			const arcCurve = makeArc({
				x0: cur[0],
				y0: cur[1],
				rx: instruction.rx,
				ry: instruction.ry,
				xAxisRotate: instruction.xAxisRotation,
				LargeArcFlag: instruction.largeArcFlag,
				SweepFlag: instruction.sweepFlag,
				x1: instruction.x,
				y1: instruction.y,
			});

			length += arcCurve.getTotalLength();
			cur = [instruction.x, instruction.y];
			functions.push(arcCurve);
		} else if (instruction.type === 'a') {
			const arcCurve = makeArc({
				x0: cur[0],
				y0: cur[1],
				rx: instruction.rx,
				ry: instruction.ry,
				xAxisRotate: instruction.xAxisRotation,
				LargeArcFlag: instruction.largeArcFlag,
				SweepFlag: instruction.sweepFlag,
				x1: cur[0] + instruction.dx,
				y1: cur[1] + instruction.dy,
			});

			length += arcCurve.getTotalLength();
			cur = [cur[0] + instruction.dx, cur[1] + instruction.dy];
			functions.push(arcCurve);
		}

		partial_lengths.push(length);
	}

	return {
		segments,
		initial_point,
		length,
		partial_lengths,
		functions,
	};
};

export const construct = (string: string) => {
	const parsed = parsePath(string);
	return constructFromInstructions(parsed);
};
