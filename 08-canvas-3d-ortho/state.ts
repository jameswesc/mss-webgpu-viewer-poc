type Fn<TState extends {}> = (state: TState) => void;

// State Management
type StateManager<TState extends {}> = {
    updateState: (updateFn: Fn<TState>) => void;
    getState: () => TState;
    subscribe: (subFn: Fn<TState>) => void;
};

// I probably shouldn't have these coupled but its ok for now
export function createState<TState extends {}>(
    initialState: TState,
): StateManager<TState> {
    const state: TState = initialState;

    const subscribers: Fn<TState>[] = [];

    function getState(): TState {
        return state;
    }

    function updateState(updateFn: Fn<TState>) {
        updateFn(state);

        subscribers.forEach((subFn) => subFn(state));
    }

    function subscribe(subFn: Fn<TState>) {
        subFn(state);

        subscribers.push(subFn);
    }

    return {
        getState,
        updateState,
        subscribe,
    };
}
