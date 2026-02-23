 * I want to create a DAG runner that recieve a Task[], sort based on dependency and run every task in order, can run task in parallel if there are not type "inference" and not have uncompleted dependencies. 
 * The dependant child task only execute when prior task ends.
 * The architecture is: a svelte 5 store using $state() with a Task[]. I want to make it in a state to change later values dynamically in UI. Then a taskRunner that execute ordered tasks.
 * When run finish without errors, store the return in data key of the task in the store. the run method of a task recieve the data of all the dependecies of the task finished, like: {["dependency1Id"]: data, [dependency2Id]: data}.

The main idea is to have a store with a array of task that can be edited via widgets in a later iteration. the runner take the tasks and run the pipeline storing the result states in each data key.


```ts
 Task {
    id: string: 
    widget: boolean;
    dependencies: string[]; /* task ids to be finished */
    type: "script" | "ia";
    data: any;
    run: (state, statusUpdater) => void; 
    systemMessage: string;
    userMessage: (state) => string
    completionOptions: LlamaChatCompletionsRequest:
}
```

If task.type === "ia", i want to runner runs chatCompletions() with task.completeOptions + messages: lamaChatMessage[] key with the systemMessage, and the userMessage(), then store the result of the inference in the data key in the store. else just invoque run and store the result in data key.