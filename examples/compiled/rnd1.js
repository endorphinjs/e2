import { computed, html } from 'endorphin';
import { createContext, setupContext, finalizeContext } from 'endorphin/internal';

export default function MyComponent({ firstName, lastName }) {
	const invalidate = createContext();

	const fullName = computed(() => `${firstName} ${lastName}`);
	const uppercaseFullName = computed(() => fullName.toUpperCase());

	const onClick = () => {
		firstName += '1';
		console.log(uppercaseFullName);
	};

	setupContext([firstName, lastName, fullName, uppercaseFullName])

	/// template

	// return html`<div>${uppercaseFullName}</div>`;
	return finalizeContext((nextProps) => {
		invalidate(0, firstName = nextProps.firstName);
		invalidate(1, lastName = nextProps.lastName);
	});

	// ...или

	return finalizeContext({
		getFullName() {
			return fullName;
		},
		update(nextProps) {
			invalidate(0, firstName = nextProps.firstName);
			invalidate(1, lastName = nextProps.lastName);
		}
	});
}


function finalizeContext(input) {
	
	return {
		update: input.update || input,
		mount() {

		},
		unmount() {

		}
	}
}